import { GuildMember } from 'discord.js';

export async function applyAutoRoles(member: GuildMember, roleIdsRaw: string) {
  if (!roleIdsRaw || !roleIdsRaw.trim()) return;

  const ids = roleIdsRaw.split(',').map(s => s.trim()).filter(Boolean);
  if (ids.length === 0) return;

  try {
    const me = member.guild.members.me;
    if (!me) return;

    const valid = ids.filter(id => {
      const role = member.guild.roles.cache.get(id);
      return role && !role.managed && role.position < me.roles.highest.position;
    });

    if (valid.length === 0) {
      console.warn(`[autoRole] Ningún rol asignable en ${member.guild.name}`);
      return;
    }

    await member.roles.add(valid);
    console.log(`[autoRole] Roles asignados a ${member.user.tag}: ${valid.join(', ')}`);
  } catch (err) {
    console.error(`Error asignando roles a ${member.user.tag}:`, err);
  }
}