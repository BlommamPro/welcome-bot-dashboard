import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  ButtonInteraction,
} from 'discord.js';
import { prisma } from 'shared';
import { handleMemberAdd } from './handlers/welcome.js';
import { handleMemberRemove } from './handlers/goodbye.js';
import { startApi } from './api.js';
import { initAllInvites, cacheGuildInvites } from './handlers/invites.js';
import { handleVerifyButton, VERIFY_BUTTON_PREFIX } from './handlers/verification.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.DirectMessages,
  ],
});

const commands = [
  new SlashCommandBuilder()
    .setName('test')
    .setDescription('Prueba el mensaje de bienvenida o despedida')
    .addStringOption(opt =>
      opt.setName('tipo')
        .setDescription('Qué quieres probar')
        .setRequired(true)
        .addChoices(
          { name: 'Bienvenida', value: 'welcome' },
          { name: 'Despedida', value: 'goodbye' },
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Muestra la configuración actual del bot en este servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
];

async function registerCommands() {
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID!),
      { body: commands },
    );
    console.log('✅ Comandos slash registrados');
  } catch (err) {
    console.error('Error registrando comandos:', err);
  }
}

async function handleChatCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    return interaction.reply({ content: 'Este comando solo funciona en servidores.', ephemeral: true });
  }

  if (interaction.commandName === 'test') {
    const tipo = interaction.options.getString('tipo', true);
    await interaction.deferReply({ ephemeral: true });
    const member = await interaction.guild.members.fetch(interaction.user.id);
    try {
      if (tipo === 'welcome') await handleMemberAdd(member);
      else await handleMemberRemove(member);
      await interaction.editReply({ content: `✅ Test de ${tipo} enviado.` });
    } catch (err: any) {
      await interaction.editReply({ content: `❌ Error: ${err.message}` });
    }
    return;
  }

  if (interaction.commandName === 'config') {
    const cfg = await prisma.guildConfig.findUnique({
      where: { guildId: interaction.guild.id },
    });
    if (!cfg) {
      return interaction.reply({ content: 'No hay configuración todavía.', ephemeral: true });
    }
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`Configuración — ${interaction.guild.name}`)
      .addFields(
        {
          name: '👋 Bienvenida',
          value: cfg.welcomeEnabled
            ? `🟢 **ON** · <#${cfg.welcomeChannel ?? '?'}>\n${(cfg.welcomeMessage ?? '').slice(0, 100)}`
            : '⚪ OFF',
        },
        {
          name: '🚪 Despedida',
          value: cfg.goodbyeEnabled
            ? `🟢 **ON** · <#${cfg.goodbyeChannel ?? '?'}>`
            : '⚪ OFF',
        },
        {
          name: '🎭 Auto-rol',
          value: cfg.welcomeAutoRoleEnabled
            ? `🟢 **ON** · ${cfg.welcomeAutoRoleIds.split(',').map(id => `<@&${id.trim()}>`).join(' ')}`
            : '⚪ OFF',
        },
        {
          name: '✉️ DM de bienvenida',
          value: cfg.welcomeDmEnabled ? '🟢 ON' : '⚪ OFF',
        },
        {
          name: '🔒 Verificación',
          value: cfg.verificationEnabled
            ? `🟢 **ON** · <#${cfg.verificationChannel ?? '?'}>`
            : '⚪ OFF',
        },
      )
      .setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Bot listo como ${c.user.tag}`);
  await registerCommands();
  await initAllInvites(client);
  startApi(client);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    await handleChatCommand(interaction).catch(console.error);
  } else if (interaction.isButton() && interaction.customId.startsWith(VERIFY_BUTTON_PREFIX)) {
    await handleVerifyButton(interaction as ButtonInteraction).catch(console.error);
  }
});

client.on(Events.GuildMemberAdd, (member) => {
  handleMemberAdd(member).catch(console.error);
});

client.on(Events.GuildMemberRemove, (member) => {
  handleMemberRemove(member).catch(console.error);
});

client.on(Events.InviteCreate, (invite) => {
  if (invite.guild) cacheGuildInvites(invite.guild).catch(console.error);
});
client.on(Events.InviteDelete, (invite) => {
  if (invite.guild) cacheGuildInvites(invite.guild).catch(console.error);
});

client.login(process.env.DISCORD_TOKEN);