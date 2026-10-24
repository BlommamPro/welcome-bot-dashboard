import {
  Client,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextChannel,
  ButtonInteraction,
} from 'discord.js';
import { prisma } from 'shared';

export const VERIFY_BUTTON_PREFIX = 'verify:';

/**
 * Envía (o edita) el mensaje de verificación en el canal indicado.
 * Si ya había un messageId guardado y el mensaje sigue existiendo, lo edita.
 * Si no, crea uno nuevo y guarda su id en la DB.
 */
export async function setupVerificationMessage(
  client: Client,
  guildId: string,
  channelId: string,
  roleId: string,
  message: string,
  buttonText: string,
) {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    throw new Error('Servidor no encontrado o el bot no está en él');
  }

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    throw new Error('Canal no encontrado o no es de texto');
  }

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🔒 Verificación')
    .setDescription(message || 'Pulsa el botón de abajo para verificarte.');

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${VERIFY_BUTTON_PREFIX}${roleId}`)
      .setLabel(buttonText || 'Verificarme')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
  );

  const textChannel = channel as TextChannel;

  const cfg = await prisma.guildConfig.findUnique({ where: { guildId } });
  const existingId = cfg?.verificationMessageId;

  if (existingId) {
    try {
      const msg = await textChannel.messages.fetch(existingId);
      await msg.edit({ embeds: [embed], components: [row] });
      console.log(`[Verificación] Mensaje editado en ${guild.name}`);

      await prisma.guildConfig.update({
        where: { guildId },
        data: {
          verificationChannel: channelId,
          verificationRoleId: roleId,
          verificationMessage: message,
          verificationButtonText: buttonText,
        },
      });
      return;
    } catch {
      console.log(`[Verificación] Mensaje previo no encontrado, creando uno nuevo en ${guild.name}`);
    }
  }

  const sent = await textChannel.send({ embeds: [embed], components: [row] });

  await prisma.guildConfig.update({
    where: { guildId },
    data: {
      verificationChannel: channelId,
      verificationRoleId: roleId,
      verificationMessage: message,
      verificationButtonText: buttonText,
      verificationMessageId: sent.id,
    },
  });

  console.log(`[Verificación] Mensaje enviado en ${guild.name} (id: ${sent.id})`);
}

/**
 * Maneja el click del botón de verificación.
 */
export async function handleVerifyButton(interaction: ButtonInteraction) {
  const roleId = interaction.customId.slice(VERIFY_BUTTON_PREFIX.length);
  if (!interaction.guild) return;

  try {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const role = interaction.guild.roles.cache.get(roleId);

    if (!role) {
      return interaction.reply({
        content: '❌ El rol de verificación ya no existe.',
        ephemeral: true,
      });
    }

    if (member.roles.cache.has(roleId)) {
      return interaction.reply({
        content: '✅ Ya estás verificado.',
        ephemeral: true,
      });
    }

    await member.roles.add(role);
    await interaction.reply({
      content: '✅ ¡Verificado! Ya tienes acceso al servidor.',
      ephemeral: true,
    });
  } catch (err) {
    console.error('Error en verificación:', err);
    await interaction.reply({
      content: '❌ No se pudo asignar el rol. Contacta a un admin.',
      ephemeral: true,
    }).catch(() => {});
  }
}