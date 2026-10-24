import { GuildMember } from 'discord.js';

export async function sendWelcomeDm(member: GuildMember, message: string) {
  try {
    await member.send({ content: message });
    console.log(`[DM] Enviado a ${member.user.tag}`);
  } catch (err) {
    console.warn(`No se pudo enviar DM a ${member.user.tag}:`, (err as Error).message);
  }
}