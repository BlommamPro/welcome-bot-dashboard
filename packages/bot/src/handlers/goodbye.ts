import {
  GuildMember,
  EmbedBuilder,
  AttachmentBuilder,
  TextChannel,
  Guild,
} from 'discord.js';
import { prisma, renderCard } from 'shared';

function renderTemplate(tpl: string, member: GuildMember) {
  return tpl
    .replaceAll('{user}', member.user.username)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{count}', String(member.guild.memberCount));
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

export async function handleMemberRemove(member: GuildMember) {
  const cfg = await prisma.guildConfig.findUnique({
    where: { guildId: member.guild.id },
  });
  if (!cfg?.goodbyeEnabled || !cfg.goodbyeChannel) return;

  const channels = getChannels(member.guild, cfg.goodbyeChannel);
  if (channels.length === 0) return;

  const tpl = (s: string | null | undefined) => renderTemplate(s ?? '', member);

  try {
    const embed = new EmbedBuilder().setColor(cfg.goodbyeColor as `#${string}`);

    const desc = tpl(cfg.goodbyeMessage);
    if (desc.trim()) embed.setDescription(desc);

    const title = tpl(cfg.goodbyeEmbedTitle);
    if (title.trim()) {
      if (cfg.goodbyeEmbedTitleUrl?.trim()) embed.setTitle(title).setURL(cfg.goodbyeEmbedTitleUrl);
      else embed.setTitle(title);
    }

    const authorName = tpl(cfg.goodbyeEmbedAuthorName);
    if (authorName.trim()) {
      const icon = cfg.goodbyeEmbedAuthorIcon?.trim() || undefined;
      embed.setAuthor({ name: authorName, iconURL: icon });
    }

    if (cfg.goodbyeEmbedThumbnail?.trim()) {
      const thumbUrl = cfg.goodbyeEmbedThumbnail === 'avatar'
        ? member.user.displayAvatarURL({ size: 256 })
        : cfg.goodbyeEmbedThumbnail;
      embed.setThumbnail(thumbUrl);
    }

    const files: AttachmentBuilder[] = [];
    if (cfg.goodbyeEmbedShowCard) {
      const buffer = await renderCard({
        width: cfg.goodbyeCardWidth,
        height: cfg.goodbyeCardHeight,
        layout: (cfg.goodbyeCardLayout as any) ?? 'centered',

        bgColor: cfg.goodbyeCardBgColor,
        bgType: (cfg.goodbyeCardBgType as any) ?? 'solid',
        bgColor2: cfg.goodbyeCardBgColor2,
        bgAngle: cfg.goodbyeCardBgAngle,
        blur: cfg.goodbyeCardBlur,
        bgImage: cfg.goodbyeImage,
        overlayColor: cfg.goodbyeCardOverlayColor,
        overlayOpacity: cfg.goodbyeCardOverlayOpacity,

        borderEnabled: cfg.goodbyeCardBorderEnabled,
        borderColor: cfg.goodbyeCardBorderColor,
        borderWidth: cfg.goodbyeCardBorderWidth,
        borderRadius: cfg.goodbyeCardBorderRadius,

        avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 512 }),
        avatarSize: cfg.goodbyeCardAvatarSize,
        avatarX: cfg.goodbyeCardAvatarX,
        avatarY: cfg.goodbyeCardAvatarY,
        avatarBorder: cfg.goodbyeCardAvatarBorder,
        avatarBorderW: cfg.goodbyeCardAvatarBorderW,
        avatarRound: cfg.goodbyeCardAvatarRound,

        username: cfg.goodbyeCardUsername ? member.user.username : null,
        usernameColor: cfg.goodbyeCardUsernameColor,
        usernameSize: cfg.goodbyeCardUsernameSize,
        usernameX: cfg.goodbyeCardUsernameX,
        usernameY: cfg.goodbyeCardUsernameY,
        usernameFont: cfg.goodbyeCardUsernameFont,
        usernameShadow: cfg.goodbyeCardUsernameShadow,

        title: tpl(cfg.goodbyeCardTitle),
        titleColor: cfg.goodbyeCardTitleColor,
        titleSize: cfg.goodbyeCardTitleSize,
        titleX: cfg.goodbyeCardTitleX,
        titleY: cfg.goodbyeCardTitleY,
        titleFont: cfg.goodbyeCardTitleFont,
        titleShadow: cfg.goodbyeCardTitleShadow,
        titleShadowColor: cfg.goodbyeCardTitleShadowColor,
        titleShadowBlur: cfg.goodbyeCardTitleShadowBlur,

        subtitle: tpl(cfg.goodbyeCardSubtitle),
        subtitleColor: cfg.goodbyeCardSubtitleColor,
        subtitleSize: cfg.goodbyeCardSubtitleSize,
        subtitleX: cfg.goodbyeCardSubtitleX,
        subtitleY: cfg.goodbyeCardSubtitleY,
        subtitleFont: cfg.goodbyeCardSubtitleFont,
        subtitleShadow: cfg.goodbyeCardSubtitleShadow,
        subtitleShadowColor: cfg.goodbyeCardSubtitleShadowColor,
        subtitleShadowBlur: cfg.goodbyeCardSubtitleShadowBlur,

        watermarkEnabled: cfg.goodbyeCardWatermarkEnabled,
        watermarkUrl: member.guild.iconURL({ extension: 'png', size: 256 }),
        watermarkSize: cfg.goodbyeCardWatermarkSize,
        watermarkPos: (cfg.goodbyeCardWatermarkPos as any) ?? 'bottom-right',
        watermarkOpacity: cfg.goodbyeCardWatermarkOpacity,
      });
      files.push(new AttachmentBuilder(buffer, { name: 'goodbye.png' }));
      embed.setImage('attachment://goodbye.png');
    }

    const footer = tpl(cfg.goodbyeEmbedFooter);
    if (footer.trim()) {
      const icon = cfg.goodbyeEmbedFooterIcon?.trim() || undefined;
      embed.setFooter({ text: footer, iconURL: icon });
    }

    if (cfg.goodbyeEmbedTimestamp) embed.setTimestamp(new Date());

    await Promise.all(
      channels.map(ch =>
        ch.send({ embeds: [embed], files }).catch(err => {
          console.error(`Error enviando despedida a ${ch.id}:`, err);
        })
      )
    );
  } catch (error) {
    console.error('Error generando la despedida:', error);
    const embed = new EmbedBuilder().setColor(cfg.goodbyeColor as `#${string}`);
    const desc = tpl(cfg.goodbyeMessage);
    if (desc.trim()) embed.setDescription(desc);
    await Promise.all(channels.map(ch => ch.send({ embeds: [embed] }).catch(() => {})));
  }
}