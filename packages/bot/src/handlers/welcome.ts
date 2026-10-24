import {
  GuildMember,
  EmbedBuilder,
  AttachmentBuilder,
  TextChannel,
  Guild,
} from 'discord.js';
import { prisma, renderCard } from 'shared';
import { applyAutoRoles } from './autoRole.js';
import { sendWelcomeDm } from './dm.js';
import { getInviter } from './invites.js';

function renderTemplate(tpl: string, member: GuildMember, inviterId: string | null) {
  return tpl
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{count}', String(member.guild.memberCount))
    .replaceAll('{inviter}', inviterId ? `<@${inviterId}>` : 'alguien');
}

function getChannels(guild: Guild, idsRaw: string | null): TextChannel[] {
  if (!idsRaw) return [];
  const ids = idsRaw.split(',').map(s => s.trim()).filter(Boolean);
  const channels: TextChannel[] = [];
  for (const id of ids) {
    const ch = guild.channels.cache.get(id);
    if (ch?.isTextBased()) channels.push(ch as TextChannel);
  }
  return channels;
}

export async function handleMemberAdd(member: GuildMember) {
  if (member.user.bot) return;

  const cfg = await prisma.guildConfig.findUnique({
    where: { guildId: member.guild.id },
  });
  if (!cfg) return;

  if (cfg.welcomeAutoRoleEnabled && cfg.welcomeAutoRoleIds) {
    await applyAutoRoles(member, cfg.welcomeAutoRoleIds);
  }

  let inviterId: string | null = null;
  if (cfg.welcomeTrackInvites) {
    inviterId = await getInviter(member.guild, member.id);
  }

  if (cfg.welcomeDmEnabled && cfg.welcomeDmMessage) {
    const dmText = cfg.welcomeDmMessage
      .replaceAll('{user}', member.user.username)
      .replaceAll('{username}', member.user.username)
      .replaceAll('{server}', member.guild.name)
      .replaceAll('{count}', String(member.guild.memberCount))
      .replaceAll('{inviter}', inviterId ? (member.guild.members.cache.get(inviterId)?.user.username ?? 'alguien') : 'alguien');
    await sendWelcomeDm(member, dmText);
  }

  if (!cfg.welcomeEnabled || !cfg.welcomeChannel) return;

  const channels = getChannels(member.guild, cfg.welcomeChannel);
  if (channels.length === 0) return;

  const tpl = (s: string | null | undefined) => renderTemplate(s ?? '', member, inviterId);

  try {
    const embed = new EmbedBuilder().setColor(cfg.welcomeColor as `#${string}`);

    const desc = tpl(cfg.welcomeMessage);
    if (desc.trim()) embed.setDescription(desc);

    const title = tpl(cfg.welcomeEmbedTitle);
    if (title.trim()) {
      if (cfg.welcomeEmbedTitleUrl?.trim()) embed.setTitle(title).setURL(cfg.welcomeEmbedTitleUrl);
      else embed.setTitle(title);
    }

    const authorName = tpl(cfg.welcomeEmbedAuthorName);
    if (authorName.trim()) {
      const icon = cfg.welcomeEmbedAuthorIcon?.trim() || undefined;
      embed.setAuthor({ name: authorName, iconURL: icon });
    }

    if (cfg.welcomeEmbedThumbnail?.trim()) {
      const thumbUrl = cfg.welcomeEmbedThumbnail === 'avatar'
        ? member.user.displayAvatarURL({ size: 256 })
        : cfg.welcomeEmbedThumbnail;
      embed.setThumbnail(thumbUrl);
    }

    const files: AttachmentBuilder[] = [];
    if (cfg.welcomeEmbedShowCard) {
      const buffer = await renderCard({
        width: cfg.welcomeCardWidth,
        height: cfg.welcomeCardHeight,
        layout: (cfg.welcomeCardLayout as any) ?? 'centered',

        bgColor: cfg.welcomeCardBgColor,
        bgType: (cfg.welcomeCardBgType as any) ?? 'solid',
        bgColor2: cfg.welcomeCardBgColor2,
        bgAngle: cfg.welcomeCardBgAngle,
        blur: cfg.welcomeCardBlur,
        bgImage: cfg.welcomeImage,
        overlayColor: cfg.welcomeCardOverlayColor,
        overlayOpacity: cfg.welcomeCardOverlayOpacity,

        borderEnabled: cfg.welcomeCardBorderEnabled,
        borderColor: cfg.welcomeCardBorderColor,
        borderWidth: cfg.welcomeCardBorderWidth,
        borderRadius: cfg.welcomeCardBorderRadius,

        avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 512 }),
        avatarSize: cfg.welcomeCardAvatarSize,
        avatarX: cfg.welcomeCardAvatarX,
        avatarY: cfg.welcomeCardAvatarY,
        avatarBorder: cfg.welcomeCardAvatarBorder,
        avatarBorderW: cfg.welcomeCardAvatarBorderW,
        avatarRound: cfg.welcomeCardAvatarRound,

        username: cfg.welcomeCardUsername ? member.user.username : null,
        usernameColor: cfg.welcomeCardUsernameColor,
        usernameSize: cfg.welcomeCardUsernameSize,
        usernameX: cfg.welcomeCardUsernameX,
        usernameY: cfg.welcomeCardUsernameY,
        usernameFont: cfg.welcomeCardUsernameFont,
        usernameShadow: cfg.welcomeCardUsernameShadow,

        title: tpl(cfg.welcomeCardTitle),
        titleColor: cfg.welcomeCardTitleColor,
        titleSize: cfg.welcomeCardTitleSize,
        titleX: cfg.welcomeCardTitleX,
        titleY: cfg.welcomeCardTitleY,
        titleFont: cfg.welcomeCardTitleFont,
        titleShadow: cfg.welcomeCardTitleShadow,
        titleShadowColor: cfg.welcomeCardTitleShadowColor,
        titleShadowBlur: cfg.welcomeCardTitleShadowBlur,

        subtitle: tpl(cfg.welcomeCardSubtitle),
        subtitleColor: cfg.welcomeCardSubtitleColor,
        subtitleSize: cfg.welcomeCardSubtitleSize,
        subtitleX: cfg.welcomeCardSubtitleX,
        subtitleY: cfg.welcomeCardSubtitleY,
        subtitleFont: cfg.welcomeCardSubtitleFont,
        subtitleShadow: cfg.welcomeCardSubtitleShadow,
        subtitleShadowColor: cfg.welcomeCardSubtitleShadowColor,
        subtitleShadowBlur: cfg.welcomeCardSubtitleShadowBlur,

        watermarkEnabled: cfg.welcomeCardWatermarkEnabled,
        watermarkUrl: member.guild.iconURL({ extension: 'png', size: 256 }),
        watermarkSize: cfg.welcomeCardWatermarkSize,
        watermarkPos: (cfg.welcomeCardWatermarkPos as any) ?? 'bottom-right',
        watermarkOpacity: cfg.welcomeCardWatermarkOpacity,
      });
      files.push(new AttachmentBuilder(buffer, { name: 'welcome.png' }));
      embed.setImage('attachment://welcome.png');
    }

    const footer = tpl(cfg.welcomeEmbedFooter);
    if (footer.trim()) {
      const icon = cfg.welcomeEmbedFooterIcon?.trim() || undefined;
      embed.setFooter({ text: footer, iconURL: icon });
    }

    if (cfg.welcomeEmbedTimestamp) embed.setTimestamp(new Date());

    await Promise.all(
      channels.map(ch =>
        ch.send({ embeds: [embed], files }).catch(err => {
          console.error(`Error enviando bienvenida a ${ch.id}:`, err);
        })
      )
    );
  } catch (error) {
    console.error('Error generando la bienvenida:', error);
    const embed = new EmbedBuilder().setColor(cfg.welcomeColor as `#${string}`);
    const desc = tpl(cfg.welcomeMessage);
    if (desc.trim()) embed.setDescription(desc);
    await Promise.all(channels.map(ch => ch.send({ embeds: [embed] }).catch(() => {})));
  }
}