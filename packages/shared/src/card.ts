import { createCanvas, loadImage, GlobalFonts, Image } from '@napi-rs/canvas';
import path from 'node:path';
import { FONTS_DIR, UPLOADS_DIR } from './paths.js';

const FONT_FILES: Record<string, string> = {
  Inter: 'Inter-Bold.ttf',
  Poppins: 'Poppins-Bold.ttf',
  Montserrat: 'Montserrat-Bold.ttf',
  Roboto: 'Roboto-Bold.ttf',
  RobotoMono: 'RobotoMono-Bold.ttf',
};

let fontsRegistered = false;
function registerFonts() {
  if (fontsRegistered) return;
  for (const [name, file] of Object.entries(FONT_FILES)) {
    try {
      GlobalFonts.registerFromPath(path.join(FONTS_DIR, file), name);
    } catch {
    }
  }
  fontsRegistered = true;
}

function fontFor(name: string) {
  if (name && FONT_FILES[name]) return `"${name}", "Inter", sans-serif`;
  return `"Inter", "Segoe UI", sans-serif`;
}

const IMG_CACHE = new Map<string, { img: Image; ts: number }>();
const IMG_TTL = 5 * 60_000;

async function loadImageCached(src: string): Promise<Image> {
  const now = Date.now();
  const hit = IMG_CACHE.get(src);
  if (hit && now - hit.ts < IMG_TTL) return hit.img;

  let img: Image;
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`No se pudo descargar la imagen: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    img = await loadImage(buf);
  } else {
    img = await loadImage(src);
  }

  IMG_CACHE.set(src, { img, ts: now });
  return img;
}

export interface CardOptions {
  width: number;
  height: number;
  layout: 'centered' | 'horizontal' | 'minimal' | 'banner';

  bgColor: string;
  bgType: 'solid' | 'linear' | 'radial';
  bgColor2: string;
  bgAngle: number;
  blur: number;
  bgImage?: string | null;
  overlayColor: string;
  overlayOpacity: number;

  borderEnabled: boolean;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;

  avatarUrl: string;
  avatarSize: number;
  avatarX: number;
  avatarY: number;
  avatarBorder: string;
  avatarBorderW: number;
  avatarRound: boolean;

  username?: string | null;
  usernameColor: string;
  usernameSize: number;
  usernameX: number;
  usernameY: number;
  usernameFont: string;
  usernameShadow: boolean;

  title: string;
  titleColor: string;
  titleSize: number;
  titleX: number;
  titleY: number;
  titleFont: string;
  titleShadow: boolean;
  titleShadowColor: string;
  titleShadowBlur: number;

  subtitle: string;
  subtitleColor: string;
  subtitleSize: number;
  subtitleX: number;
  subtitleY: number;
  subtitleFont: string;
  subtitleShadow: boolean;
  subtitleShadowColor: string;
  subtitleShadowBlur: number;

  watermarkEnabled: boolean;
  watermarkUrl?: string | null;
  watermarkSize: number;
  watermarkPos: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  watermarkOpacity: number;
}

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function applyShadow(ctx: any, enabled: boolean, color: string, blur: number) {
  if (enabled) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
  } else {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }
}

function roundRectPath(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export async function renderCard(opts: CardOptions): Promise<Buffer> {
  registerFonts();

  const canvas = createCanvas(opts.width, opts.height);
  const ctx = canvas.getContext('2d');

  if (opts.borderRadius > 0) {
    ctx.save();
    roundRectPath(ctx, 0, 0, opts.width, opts.height, opts.borderRadius);
    ctx.clip();
    await drawBackground(ctx, opts);
    ctx.restore();
  } else {
    await drawBackground(ctx, opts);
  }

  if (opts.overlayOpacity > 0) {
    ctx.save();
    if (opts.borderRadius > 0) {
      roundRectPath(ctx, 0, 0, opts.width, opts.height, opts.borderRadius);
      ctx.clip();
    }
    ctx.fillStyle = hexToRgba(opts.overlayColor, opts.overlayOpacity);
    ctx.fillRect(0, 0, opts.width, opts.height);
    ctx.restore();
  }

  if (opts.borderEnabled && opts.borderWidth > 0) {
    ctx.strokeStyle = opts.borderColor;
    ctx.lineWidth = opts.borderWidth;
    const inset = opts.borderWidth / 2;
    if (opts.borderRadius > 0) {
      roundRectPath(
        ctx,
        inset,
        inset,
        opts.width - opts.borderWidth,
        opts.height - opts.borderWidth,
        opts.borderRadius,
      );
      ctx.stroke();
    } else {
      ctx.strokeRect(inset, inset, opts.width - opts.borderWidth, opts.height - opts.borderWidth);
    }
  }

  const positions = computeLayout(opts);
  await drawAvatar(ctx, opts, positions.avatar);
  drawTexts(ctx, opts, positions);

  if (opts.watermarkEnabled && opts.watermarkUrl) {
    await drawWatermark(ctx, opts);
  }

  return canvas.toBuffer('image/png');
}

async function drawBackground(ctx: any, opts: CardOptions) {
  if (opts.bgImage) {
    try {
      const imgPath = path.join(UPLOADS_DIR, opts.bgImage);
      const img = await loadImageCached(imgPath);

      ctx.save();
      if (opts.blur > 0) ctx.filter = `blur(${opts.blur}px)`;

      const scale = Math.max(opts.width / img.width, opts.height / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = (opts.width - w) / 2;
      const y = (opts.height - h) / 2;
      ctx.drawImage(img, x, y, w, h);
      ctx.restore();
      return;
    } catch {
    }
  }

  if (opts.bgType === 'linear') {
    const angle = ((opts.bgAngle - 90) * Math.PI) / 180;
    const x1 = opts.width / 2 - Math.cos(angle) * opts.width / 2;
    const y1 = opts.height / 2 - Math.sin(angle) * opts.height / 2;
    const x2 = opts.width / 2 + Math.cos(angle) * opts.width / 2;
    const y2 = opts.height / 2 + Math.sin(angle) * opts.height / 2;
    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, opts.bgColor);
    grad.addColorStop(1, opts.bgColor2);
    ctx.fillStyle = grad;
  } else if (opts.bgType === 'radial') {
    const grad = ctx.createRadialGradient(
      opts.width / 2, opts.height / 2, 0,
      opts.width / 2, opts.height / 2, Math.max(opts.width, opts.height) / 2,
    );
    grad.addColorStop(0, opts.bgColor);
    grad.addColorStop(1, opts.bgColor2);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = opts.bgColor;
  }

  ctx.fillRect(0, 0, opts.width, opts.height);
}

async function drawAvatar(
  ctx: any,
  opts: CardOptions,
  pos: { x: number; y: number; size: number },
) {
  const size = pos.size;
  const r = size / 2;
  const cx = pos.x;
  const cy = pos.y + r;

  try {
    const avatar = await loadImageCached(opts.avatarUrl);

    ctx.save();
    if (opts.avatarRound) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
    }
    ctx.drawImage(avatar, cx - r, cy - r, size, size);
    ctx.restore();

    if (opts.avatarBorderW > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = opts.avatarBorder;
      ctx.lineWidth = opts.avatarBorderW;
      ctx.stroke();
    }
  } catch {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#444';
    ctx.fill();
  }
}

function computeLayout(opts: CardOptions) {
  const cx = opts.width / 2;
  const cy = opts.height / 2;

  if (opts.layout === 'horizontal') {
    return {
      avatar: {
        x: 120 + opts.avatarX,
        y: cy - opts.avatarSize / 2 + opts.avatarY,
        size: opts.avatarSize,
      },
      align: 'left' as const,
      textX: 240 + opts.titleX,
      titleY: cy - 40 + opts.titleY,
      subtitleY: cy + 20 + opts.subtitleY,
      usernameY: cy - 90 + opts.usernameY,
    };
  }

  if (opts.layout === 'minimal') {
    return {
      avatar: { x: cx + opts.avatarX, y: opts.avatarY, size: 0 },
      align: 'center' as const,
      textX: cx + opts.titleX,
      titleY: cy - 20 + opts.titleY,
      subtitleY: cy + 40 + opts.subtitleY,
      usernameY: cy - 80 + opts.usernameY,
    };
  }

  if (opts.layout === 'banner') {
    return {
      avatar: { x: cx + opts.avatarX, y: opts.avatarY, size: opts.avatarSize },
      align: 'center' as const,
      textX: cx + opts.titleX,
      titleY: opts.titleY,
      subtitleY: opts.subtitleY,
      usernameY: opts.usernameY,
    };
  }

  return {
    avatar: { x: cx + opts.avatarX, y: opts.avatarY, size: opts.avatarSize },
    align: 'center' as const,
    textX: cx + opts.titleX,
    titleY: opts.titleY,
    subtitleY: opts.subtitleY,
    usernameY: opts.usernameY,
  };
}

function drawTexts(ctx: any, opts: CardOptions, pos: any) {
  ctx.textAlign = pos.align;
  ctx.textBaseline = 'middle';

  const font = (name: string, size: number, bold = true) =>
    `${bold ? 'bold ' : ''}${size}px ${fontFor(name)}`;

  if (opts.username && pos.avatar.size > 0) {
    ctx.fillStyle = opts.usernameColor;
    ctx.font = font(opts.usernameFont, opts.usernameSize);
    applyShadow(ctx, opts.usernameShadow, '#000000', 6);
    ctx.fillText(
      opts.username,
      pos.align === 'left' ? pos.textX : opts.width / 2 + opts.usernameX,
      pos.usernameY,
    );
    applyShadow(ctx, false, '', 0);
  }

  ctx.fillStyle = opts.titleColor;
  ctx.font = font(opts.titleFont, opts.titleSize);
  applyShadow(ctx, opts.titleShadow, opts.titleShadowColor, opts.titleShadowBlur);
  ctx.fillText(
    opts.title,
    pos.align === 'left' ? pos.textX : opts.width / 2 + opts.titleX,
    pos.titleY,
  );
  applyShadow(ctx, false, '', 0);

  ctx.fillStyle = opts.subtitleColor;
  ctx.font = font(opts.subtitleFont, opts.subtitleSize, false);
  applyShadow(ctx, opts.subtitleShadow, opts.subtitleShadowColor, opts.subtitleShadowBlur);
  ctx.fillText(
    opts.subtitle,
    pos.align === 'left' ? pos.textX : opts.width / 2 + opts.subtitleX,
    pos.subtitleY,
  );
  applyShadow(ctx, false, '', 0);
}

async function drawWatermark(ctx: any, opts: CardOptions) {
  try {
    const wm = await loadImageCached(opts.watermarkUrl!);
    const size = opts.watermarkSize;
    const pad = 20;
    let x = 0, y = 0;

    switch (opts.watermarkPos) {
      case 'top-left':      x = pad;                     y = pad; break;
      case 'top-right':     x = opts.width - size - pad; y = pad; break;
      case 'bottom-left':   x = pad;                     y = opts.height - size - pad; break;
      case 'bottom-right':
      default:              x = opts.width - size - pad; y = opts.height - size - pad; break;
    }

    ctx.save();
    ctx.globalAlpha = opts.watermarkOpacity;
    ctx.drawImage(wm, x, y, size, size);
    ctx.restore();
  } catch {
  }
}