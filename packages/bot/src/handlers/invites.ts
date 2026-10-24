import { Client, Guild, Invite } from 'discord.js';

const invitesCache = new Map<string, Map<string, number>>();

export async function cacheGuildInvites(guild: Guild) {
  try {
    const invites = await guild.invites.fetch();
    const map = new Map<string, number>();
    invites.forEach((inv: Invite) => {
      if (inv.code) map.set(inv.code, inv.uses ?? 0);
    });
    invitesCache.set(guild.id, map);
  } catch (err) {
    console.warn(`No se pudieron cachear las invites de ${guild.name}:`, (err as Error).message);
  }
}

export async function getInviter(guild: Guild, joinedMemberId: string): Promise<string | null> {
  try {
    const before = invitesCache.get(guild.id) ?? new Map<string, number>();
    const after = await guild.invites.fetch();

    let inviterId: string | null = null;

    for (const inv of after.values()) {
      if (!inv.code || !inv.inviter) continue;
      const beforeUses = before.get(inv.code) ?? 0;
      const afterUses = inv.uses ?? 0;
      if (afterUses > beforeUses) {
        inviterId = inv.inviter.id;
        break;
      }
    }

    const newMap = new Map<string, number>();
    after.forEach((inv: Invite) => {
      if (inv.code) newMap.set(inv.code, inv.uses ?? 0);
    });
    invitesCache.set(guild.id, newMap);

    return inviterId;
  } catch (err) {
    console.warn(`No se pudo detectar el inviter en ${guild.name}:`, (err as Error).message);
    return null;
  }
}

export async function initAllInvites(client: Client) {
  for (const guild of client.guilds.cache.values()) {
    await cacheGuildInvites(guild);
  }
}