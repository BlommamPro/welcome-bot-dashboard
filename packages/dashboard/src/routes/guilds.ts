import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { prisma, renderCard, UPLOADS_DIR } from 'shared';

let botGuildsCache: { data: Set<string>; ts: number } | null = null;

async function fetchBotGuilds(): Promise<Set<string>> {
  const now = Date.now();
  if (botGuildsCache && now - botGuildsCache.ts < 30_000) {
    return botGuildsCache.data;
  }
  try {
    const res = await fetch(`${process.env.BOT_API_URL}/guilds`, {
      headers: { 'x-api-token': process.env.INTERNAL_API_TOKEN! },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const set = new Set<string>(data.guilds ?? []);
    botGuildsCache = { data: set, ts: now };
    return set;
  } catch (err) {
    console.warn('fetchBotGuilds falló:', (err as Error).message);
    return botGuildsCache?.data ?? new Set();
  }
}

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.mimetype)) {
      return cb(new Error('Solo imágenes PNG/JPG/GIF/WEBP'));
    }
    cb(null, true);
  },
});

const num = (v: any, def: number, min = -10000, max = 10000) => {
  if (v === undefined || v === null || v === '') return def;
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
};

const numF = (v: any, def: number, min = 0, max = 1) => {
  if (v === undefined || v === null || v === '') return def;
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
};

const bool = (v: any) => v === 'on' || v === true || v === 'true';
const str = (v: any, def: string) => (v === undefined || v === null || v === '' ? def : String(v));
const nullableStr = (v: any) => (v === undefined || v === null || v === '' ? null : String(v));

const CARD_W = (v: any, def: number) => num(v, def, 200, 2000);
const CARD_H = (v: any, def: number) => num(v, def, 100, 2000);
const FONT_SIZE = (v: any, def: number) => num(v, def, 8, 200);
const BORDER_W = (v: any, def: number) => num(v, def, 0, 20);
const RADIUS = (v: any, def: number) => num(v, def, 0, 200);
const BLUR = (v: any, def: number) => num(v, def, 0, 50);
const ANGLE = (v: any, def: number) => num(v, def, 0, 360);
const POS_OFFSET = (v: any, def: number) => num(v, def, -2000, 2000);

export const router = Router();

router.get('/', async (req: any, res) => {
  const adminGuilds = req.user.guilds.filter((g: any) => {
    if (g.owner) return true;
    try {
      const perms = BigInt(g.permissions);
      return (perms & 0x8n) === 0x8n || (perms & 0x20n) === 0x20n;
    } catch {
      return false;
    }
  });

  const configs = await prisma.guildConfig.findMany({
    where: { guildId: { in: adminGuilds.map((g: any) => g.id) } },
  });

  const botGuilds = await fetchBotGuilds();

  const guildsWithBot = adminGuilds.map((g: any) => ({
    ...g,
    hasBot: botGuilds.has(g.id),
  }));

  const map = Object.fromEntries(configs.map(c => [c.guildId, c]));
  res.render('guilds', {
    guilds: guildsWithBot,
    configs: map,
    user: req.user,
    clientId: process.env.CLIENT_ID,
  });
});

router.get('/:id', async (req: any, res) => {
  const guild = req.user.guilds.find((g: any) => g.id === req.params.id);
  if (!guild) return res.status(403).send('Sin acceso');

  const botGuilds = await fetchBotGuilds();
  const hasBot = botGuilds.has(guild.id);

  if (!hasBot) {
    return res.render('invite', {
      guild,
      clientId: process.env.CLIENT_ID,
      user: req.user,
    });
  }

  let config = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
  if (!config) {
    config = await prisma.guildConfig.create({ data: { guildId: guild.id } });
  }
  res.render('guild', { guild, config });
});

router.get('/:id/resources', async (req: any, res) => {
  const guild = req.user.guilds.find((g: any) => g.id === req.params.id);
  if (!guild) return res.status(403).json({ error: 'Sin acceso' });

  try {
    const response = await fetch(
      `${process.env.BOT_API_URL}/guild/${req.params.id}/resources`,
      { headers: { 'x-api-token': process.env.INTERNAL_API_TOKEN! } }
    );
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id', upload.fields([
  { name: 'welcomeImage', maxCount: 1 },
  { name: 'goodbyeImage', maxCount: 1 },
]), async (req: any, res) => {
  const guild = req.user.guilds.find((g: any) => g.id === req.params.id);
  if (!guild) return res.status(403).send('Sin acceso');

  const b = req.body;
  const files: any = req.files ?? {};

  const data: any = {
    welcomeEnabled: bool(b.welcomeEnabled),
    welcomeChannel: nullableStr(b.welcomeChannel),
    welcomeMessage: nullableStr(b.welcomeMessage),
    welcomeEmbed: bool(b.welcomeEmbed),
    welcomeColor: str(b.welcomeColor, '#5865F2'),

    welcomeCardLayout: str(b.welcomeCardLayout, 'centered'),

    welcomeCardWidth: CARD_W(b.welcomeCardWidth, 1024),
    welcomeCardHeight: CARD_H(b.welcomeCardHeight, 450),
    welcomeCardBgColor: str(b.welcomeCardBgColor, '#1a1a2e'),
    welcomeCardBgType: str(b.welcomeCardBgType, 'solid'),
    welcomeCardBgColor2: str(b.welcomeCardBgColor2, '#5865F2'),
    welcomeCardBgAngle: ANGLE(b.welcomeCardBgAngle, 135),
    welcomeCardBlur: BLUR(b.welcomeCardBlur, 0),
    welcomeCardOverlayColor: str(b.welcomeCardOverlayColor, '#000000'),
    welcomeCardOverlayOpacity: numF(b.welcomeCardOverlayOpacity, 0),

    welcomeCardBorderEnabled: bool(b.welcomeCardBorderEnabled),
    welcomeCardBorderColor: str(b.welcomeCardBorderColor, '#5865F2'),
    welcomeCardBorderWidth: BORDER_W(b.welcomeCardBorderWidth, 4),
    welcomeCardBorderRadius: RADIUS(b.welcomeCardBorderRadius, 0),

    welcomeCardTitle: str(b.welcomeCardTitle, '¡Bienvenido!'),
    welcomeCardTitleColor: str(b.welcomeCardTitleColor, '#ff4757'),
    welcomeCardTitleSize: FONT_SIZE(b.welcomeCardTitleSize, 56),
    welcomeCardTitleX: POS_OFFSET(b.welcomeCardTitleX, 0),
    welcomeCardTitleY: POS_OFFSET(b.welcomeCardTitleY, 275),
    welcomeCardTitleFont: str(b.welcomeCardTitleFont, 'Inter'),
    welcomeCardTitleShadow: bool(b.welcomeCardTitleShadow),
    welcomeCardTitleShadowColor: str(b.welcomeCardTitleShadowColor, '#000000'),
    welcomeCardTitleShadowBlur: BLUR(b.welcomeCardTitleShadowBlur, 8),

    welcomeCardSubtitle: b.welcomeCardSubtitle ?? '',
    welcomeCardSubtitleColor: str(b.welcomeCardSubtitleColor, '#ffffff'),
    welcomeCardSubtitleSize: FONT_SIZE(b.welcomeCardSubtitleSize, 32),
    welcomeCardSubtitleX: POS_OFFSET(b.welcomeCardSubtitleX, 0),
    welcomeCardSubtitleY: POS_OFFSET(b.welcomeCardSubtitleY, 355),
    welcomeCardSubtitleFont: str(b.welcomeCardSubtitleFont, 'Inter'),
    welcomeCardSubtitleShadow: bool(b.welcomeCardSubtitleShadow),
    welcomeCardSubtitleShadowColor: str(b.welcomeCardSubtitleShadowColor, '#000000'),
    welcomeCardSubtitleShadowBlur: BLUR(b.welcomeCardSubtitleShadowBlur, 6),

    welcomeCardUsername: bool(b.welcomeCardUsername),
    welcomeCardUsernameColor: str(b.welcomeCardUsernameColor, '#ffffff'),
    welcomeCardUsernameSize: FONT_SIZE(b.welcomeCardUsernameSize, 40),
    welcomeCardUsernameX: POS_OFFSET(b.welcomeCardUsernameX, 0),
    welcomeCardUsernameY: POS_OFFSET(b.welcomeCardUsernameY, 320),
    welcomeCardUsernameFont: str(b.welcomeCardUsernameFont, 'Inter'),
    welcomeCardUsernameShadow: bool(b.welcomeCardUsernameShadow),

    welcomeCardAvatarSize: num(b.welcomeCardAvatarSize, 160, 16, 500),
    welcomeCardAvatarX: POS_OFFSET(b.welcomeCardAvatarX, 0),
    welcomeCardAvatarY: POS_OFFSET(b.welcomeCardAvatarY, 80),
    welcomeCardAvatarBorder: str(b.welcomeCardAvatarBorder, '#5865F2'),
    welcomeCardAvatarBorderW: BORDER_W(b.welcomeCardAvatarBorderW, 6),
    welcomeCardAvatarRound: bool(b.welcomeCardAvatarRound),

    welcomeCardWatermarkEnabled: bool(b.welcomeCardWatermarkEnabled),
    welcomeCardWatermarkSize: num(b.welcomeCardWatermarkSize, 48, 8, 300),
    welcomeCardWatermarkPos: str(b.welcomeCardWatermarkPos, 'bottom-right'),
    welcomeCardWatermarkOpacity: numF(b.welcomeCardWatermarkOpacity, 0.5),

    welcomeEmbedTitle: nullableStr(b.welcomeEmbedTitle),
    welcomeEmbedTitleUrl: nullableStr(b.welcomeEmbedTitleUrl),
    welcomeEmbedAuthorName: nullableStr(b.welcomeEmbedAuthorName),
    welcomeEmbedAuthorIcon: nullableStr(b.welcomeEmbedAuthorIcon),
    welcomeEmbedThumbnail: nullableStr(b.welcomeEmbedThumbnail),
    welcomeEmbedFooter: b.welcomeEmbedFooter ?? '',
    welcomeEmbedFooterIcon: nullableStr(b.welcomeEmbedFooterIcon),
    welcomeEmbedTimestamp: bool(b.welcomeEmbedTimestamp),
    welcomeEmbedShowCard: bool(b.welcomeEmbedShowCard),

    welcomeAutoRoleEnabled: bool(b.welcomeAutoRoleEnabled),
    welcomeAutoRoleIds: b.welcomeAutoRoleIds || '',
    welcomeDmEnabled: bool(b.welcomeDmEnabled),
    welcomeDmMessage: b.welcomeDmMessage || '',
    verificationEnabled: bool(b.verificationEnabled),
    verificationChannel: nullableStr(b.verificationChannel),
    verificationRoleId: nullableStr(b.verificationRoleId),
    verificationMessage: b.verificationMessage || '',
    verificationButtonText: b.verificationButtonText || '✅ Verificarme',
    welcomeTrackInvites: bool(b.welcomeTrackInvites),

    goodbyeEnabled: bool(b.goodbyeEnabled),
    goodbyeChannel: nullableStr(b.goodbyeChannel),
    goodbyeMessage: nullableStr(b.goodbyeMessage),
    goodbyeEmbed: bool(b.goodbyeEmbed),
    goodbyeColor: str(b.goodbyeColor, '#ED4245'),

    goodbyeCardLayout: str(b.goodbyeCardLayout, 'centered'),

    goodbyeCardWidth: CARD_W(b.goodbyeCardWidth, 1024),
    goodbyeCardHeight: CARD_H(b.goodbyeCardHeight, 450),
    goodbyeCardBgColor: str(b.goodbyeCardBgColor, '#1a1a2e'),
    goodbyeCardBgType: str(b.goodbyeCardBgType, 'solid'),
    goodbyeCardBgColor2: str(b.goodbyeCardBgColor2, '#ED4245'),
    goodbyeCardBgAngle: ANGLE(b.goodbyeCardBgAngle, 135),
    goodbyeCardBlur: BLUR(b.goodbyeCardBlur, 0),
    goodbyeCardOverlayColor: str(b.goodbyeCardOverlayColor, '#000000'),
    goodbyeCardOverlayOpacity: numF(b.goodbyeCardOverlayOpacity, 0),

    goodbyeCardBorderEnabled: bool(b.goodbyeCardBorderEnabled),
    goodbyeCardBorderColor: str(b.goodbyeCardBorderColor, '#ED4245'),
    goodbyeCardBorderWidth: BORDER_W(b.goodbyeCardBorderWidth, 4),
    goodbyeCardBorderRadius: RADIUS(b.goodbyeCardBorderRadius, 0),

    goodbyeCardTitle: str(b.goodbyeCardTitle, '¡Adiós!'),
    goodbyeCardTitleColor: str(b.goodbyeCardTitleColor, '#ED4245'),
    goodbyeCardTitleSize: FONT_SIZE(b.goodbyeCardTitleSize, 56),
    goodbyeCardTitleX: POS_OFFSET(b.goodbyeCardTitleX, 0),
    goodbyeCardTitleY: POS_OFFSET(b.goodbyeCardTitleY, 275),
    goodbyeCardTitleFont: str(b.goodbyeCardTitleFont, 'Inter'),
    goodbyeCardTitleShadow: bool(b.goodbyeCardTitleShadow),
    goodbyeCardTitleShadowColor: str(b.goodbyeCardTitleShadowColor, '#000000'),
    goodbyeCardTitleShadowBlur: BLUR(b.goodbyeCardTitleShadowBlur, 8),

    goodbyeCardSubtitle: b.goodbyeCardSubtitle ?? '',
    goodbyeCardSubtitleColor: str(b.goodbyeCardSubtitleColor, '#ffffff'),
    goodbyeCardSubtitleSize: FONT_SIZE(b.goodbyeCardSubtitleSize, 32),
    goodbyeCardSubtitleX: POS_OFFSET(b.goodbyeCardSubtitleX, 0),
    goodbyeCardSubtitleY: POS_OFFSET(b.goodbyeCardSubtitleY, 355),
    goodbyeCardSubtitleFont: str(b.goodbyeCardSubtitleFont, 'Inter'),
    goodbyeCardSubtitleShadow: bool(b.goodbyeCardSubtitleShadow),
    goodbyeCardSubtitleShadowColor: str(b.goodbyeCardSubtitleShadowColor, '#000000'),
    goodbyeCardSubtitleShadowBlur: BLUR(b.goodbyeCardSubtitleShadowBlur, 6),

    goodbyeCardUsername: bool(b.goodbyeCardUsername),
    goodbyeCardUsernameColor: str(b.goodbyeCardUsernameColor, '#ffffff'),
    goodbyeCardUsernameSize: FONT_SIZE(b.goodbyeCardUsernameSize, 40),
    goodbyeCardUsernameX: POS_OFFSET(b.goodbyeCardUsernameX, 0),
    goodbyeCardUsernameY: POS_OFFSET(b.goodbyeCardUsernameY, 320),
    goodbyeCardUsernameFont: str(b.goodbyeCardUsernameFont, 'Inter'),
    goodbyeCardUsernameShadow: bool(b.goodbyeCardUsernameShadow),

    goodbyeCardAvatarSize: num(b.goodbyeCardAvatarSize, 160, 16, 500),
    goodbyeCardAvatarX: POS_OFFSET(b.goodbyeCardAvatarX, 0),
    goodbyeCardAvatarY: POS_OFFSET(b.goodbyeCardAvatarY, 80),
    goodbyeCardAvatarBorder: str(b.goodbyeCardAvatarBorder, '#ED4245'),
    goodbyeCardAvatarBorderW: BORDER_W(b.goodbyeCardAvatarBorderW, 6),
    goodbyeCardAvatarRound: bool(b.goodbyeCardAvatarRound),

    goodbyeCardWatermarkEnabled: bool(b.goodbyeCardWatermarkEnabled),
    goodbyeCardWatermarkSize: num(b.goodbyeCardWatermarkSize, 48, 8, 300),
    goodbyeCardWatermarkPos: str(b.goodbyeCardWatermarkPos, 'bottom-right'),
    goodbyeCardWatermarkOpacity: numF(b.goodbyeCardWatermarkOpacity, 0.5),

    goodbyeEmbedTitle: nullableStr(b.goodbyeEmbedTitle),
    goodbyeEmbedTitleUrl: nullableStr(b.goodbyeEmbedTitleUrl),
    goodbyeEmbedAuthorName: nullableStr(b.goodbyeEmbedAuthorName),
    goodbyeEmbedAuthorIcon: nullableStr(b.goodbyeEmbedAuthorIcon),
    goodbyeEmbedThumbnail: nullableStr(b.goodbyeEmbedThumbnail),
    goodbyeEmbedFooter: b.goodbyeEmbedFooter ?? '',
    goodbyeEmbedFooterIcon: nullableStr(b.goodbyeEmbedFooterIcon),
    goodbyeEmbedTimestamp: bool(b.goodbyeEmbedTimestamp),
    goodbyeEmbedShowCard: bool(b.goodbyeEmbedShowCard),
  };

  if (files.welcomeImage?.[0]) data.welcomeImage = files.welcomeImage[0].filename;
  if (files.goodbyeImage?.[0]) data.goodbyeImage = files.goodbyeImage[0].filename;
  if (b.removeWelcomeImage === 'on') data.welcomeImage = null;
  if (b.removeGoodbyeImage === 'on') data.goodbyeImage = null;

  await prisma.guildConfig.upsert({
    where: { guildId: guild.id },
    create: { guildId: guild.id, ...data },
    update: data,
  });

  res.redirect(`/guilds/${guild.id}?saved=1`);
});

router.post('/:id/preview/:type', upload.fields([
  { name: 'welcomeImage', maxCount: 1 },
  { name: 'goodbyeImage', maxCount: 1 },
  { name: 'bgImage', maxCount: 1 },
]), async (req: any, res) => {
  const { id, type } = req.params;
  const guild = req.user.guilds.find((g: any) => g.id === id);
  if (!guild) return res.status(403).json({ error: 'Sin acceso' });

  const b = req.body;

  const isWelcome = type === 'welcome';
  const prefix = isWelcome ? 'welcome' : 'goodbye';

  const existing = await prisma.guildConfig.findUnique({ where: { guildId: id } });
  const files: any = req.files ?? {};
  const uploadedFile =
    files.welcomeImage?.[0] ?? files.goodbyeImage?.[0] ?? files.bgImage?.[0] ?? null;

  const bgImage: string | null =
    uploadedFile?.filename ??
    (isWelcome ? existing?.welcomeImage : existing?.goodbyeImage) ??
    null;

  const fakeUsername = b.previewUsername || 'Usuario';
  const fakeCount = num(b.previewCount, 18);
  const replace = (s: string) =>
    s
      .replaceAll('{user}', fakeUsername)
      .replaceAll('{username}', fakeUsername)
      .replaceAll('{server}', guild.name)
      .replaceAll('{count}', String(fakeCount))
      .replaceAll('{inviter}', 'Invitador');

  try {
    const buffer = await renderCard({
      width: CARD_W(b[`${prefix}CardWidth`], 1024),
      height: CARD_H(b[`${prefix}CardHeight`], 450),
      layout: str(b[`${prefix}CardLayout`], 'centered') as any,

      bgColor: str(b[`${prefix}CardBgColor`], '#1a1a2e'),
      bgType: str(b[`${prefix}CardBgType`], 'solid') as any,
      bgColor2: str(b[`${prefix}CardBgColor2`], '#5865F2'),
      bgAngle: ANGLE(b[`${prefix}CardBgAngle`], 135),
      blur: BLUR(b[`${prefix}CardBlur`], 0),
      bgImage,
      overlayColor: str(b[`${prefix}CardOverlayColor`], '#000000'),
      overlayOpacity: numF(b[`${prefix}CardOverlayOpacity`], 0),

      borderEnabled: bool(b[`${prefix}CardBorderEnabled`]),
      borderColor: str(b[`${prefix}CardBorderColor`], '#5865F2'),
      borderWidth: BORDER_W(b[`${prefix}CardBorderWidth`], 4),
      borderRadius: RADIUS(b[`${prefix}CardBorderRadius`], 0),

      avatarUrl: req.user.avatar
        ? `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png?size=512`
        : `https://cdn.discordapp.com/embed/avatars/0.png`,
      avatarSize: num(b[`${prefix}CardAvatarSize`], 160, 16, 500),
      avatarX: POS_OFFSET(b[`${prefix}CardAvatarX`], 0),
      avatarY: POS_OFFSET(b[`${prefix}CardAvatarY`], 80),
      avatarBorder: str(b[`${prefix}CardAvatarBorder`], '#5865F2'),
      avatarBorderW: BORDER_W(b[`${prefix}CardAvatarBorderW`], 6),
      avatarRound: bool(b[`${prefix}CardAvatarRound`]),

      username: bool(b[`${prefix}CardUsername`]) ? fakeUsername : null,
      usernameColor: str(b[`${prefix}CardUsernameColor`], '#ffffff'),
      usernameSize: FONT_SIZE(b[`${prefix}CardUsernameSize`], 40),
      usernameX: POS_OFFSET(b[`${prefix}CardUsernameX`], 0),
      usernameY: POS_OFFSET(b[`${prefix}CardUsernameY`], 320),
      usernameFont: str(b[`${prefix}CardUsernameFont`], 'Inter'),
      usernameShadow: bool(b[`${prefix}CardUsernameShadow`]),

      title: replace(b[`${prefix}CardTitle`] || ''),
      titleColor: str(b[`${prefix}CardTitleColor`], '#ffffff'),
      titleSize: FONT_SIZE(b[`${prefix}CardTitleSize`], 56),
      titleX: POS_OFFSET(b[`${prefix}CardTitleX`], 0),
      titleY: POS_OFFSET(b[`${prefix}CardTitleY`], 275),
      titleFont: str(b[`${prefix}CardTitleFont`], 'Inter'),
      titleShadow: bool(b[`${prefix}CardTitleShadow`]),
      titleShadowColor: str(b[`${prefix}CardTitleShadowColor`], '#000000'),
      titleShadowBlur: BLUR(b[`${prefix}CardTitleShadowBlur`], 8),

      subtitle: replace(b[`${prefix}CardSubtitle`] || ''),
      subtitleColor: str(b[`${prefix}CardSubtitleColor`], '#ffffff'),
      subtitleSize: FONT_SIZE(b[`${prefix}CardSubtitleSize`], 32),
      subtitleX: POS_OFFSET(b[`${prefix}CardSubtitleX`], 0),
      subtitleY: POS_OFFSET(b[`${prefix}CardSubtitleY`], 355),
      subtitleFont: str(b[`${prefix}CardSubtitleFont`], 'Inter'),
      subtitleShadow: bool(b[`${prefix}CardSubtitleShadow`]),
      subtitleShadowColor: str(b[`${prefix}CardSubtitleShadowColor`], '#000000'),
      subtitleShadowBlur: BLUR(b[`${prefix}CardSubtitleShadowBlur`], 6),

      watermarkEnabled: bool(b[`${prefix}CardWatermarkEnabled`]),
      watermarkUrl: guild.icon
        ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=256`
        : null,
      watermarkSize: num(b[`${prefix}CardWatermarkSize`], 48, 8, 300),
      watermarkPos: str(b[`${prefix}CardWatermarkPos`], 'bottom-right') as any,
      watermarkOpacity: numF(b[`${prefix}CardWatermarkOpacity`], 0.5),
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (err: any) {
    console.error('Error generando preview:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/test/:type', async (req: any, res) => {
  const { id, type } = req.params;
  if (!['welcome', 'goodbye'].includes(type)) {
    return res.status(400).json({ error: 'type debe ser welcome o goodbye' });
  }
  const guild = req.user.guilds.find((g: any) => g.id === id);
  if (!guild) return res.status(403).json({ error: 'Sin acceso' });

  try {
    const response = await fetch(`${process.env.BOT_API_URL}/test/${type}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-token': process.env.INTERNAL_API_TOKEN!,
      },
      body: JSON.stringify({ guildId: id, userId: req.user.id }),
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/setup-verification', async (req: any, res) => {
  const guild = req.user.guilds.find((g: any) => g.id === req.params.id);
  if (!guild) return res.status(403).json({ error: 'Sin acceso' });

  const cfg = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
  if (!cfg?.verificationEnabled || !cfg.verificationChannel || !cfg.verificationRoleId) {
    return res.status(400).json({ error: 'Falta habilitar la verificación o configurar canal/rol' });
  }

  try {
    const response = await fetch(`${process.env.BOT_API_URL}/setup-verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-token': process.env.INTERNAL_API_TOKEN!,
      },
      body: JSON.stringify({
        guildId: guild.id,
        channelId: cfg.verificationChannel,
        roleId: cfg.verificationRoleId,
        message: cfg.verificationMessage ?? '',
        buttonText: cfg.verificationButtonText ?? '✅ Verificarme',
      }),
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});