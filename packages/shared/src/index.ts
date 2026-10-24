import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
export * from '@prisma/client';
export * from './paths.js';
export * from './card.js';