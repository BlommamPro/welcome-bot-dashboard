import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(__dirname, '../../..');
export const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
export const FONTS_DIR = path.join(ROOT_DIR, 'fonts');
export const DATA_DIR = path.join(ROOT_DIR, 'data');