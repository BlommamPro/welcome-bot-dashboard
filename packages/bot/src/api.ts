import express from 'express';
import type { Client } from 'discord.js';
import { handleMemberAdd } from './handlers/welcome.js';
import { handleMemberRemove } from './handlers/goodbye.js';
import { setupVerificationMessage } from './handlers/verification.js';

export function startApi(client: Client) {
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    const token = req.header('x-api-token');
    if (token !== process.env.INTERNAL_API_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  });

  app.get('/guilds', (_req, res) => {
    const ids = client.guilds.cache.map(g => g.id);
    res.json({ guilds: ids });
  });

  app.get('/guild/:guildId/resources', async (req, res) => {
    const { guildId } = req.params;
    try {
      const guild = await client.guilds.fetch(guildId);
      await guild.channels.fetch();
      await guild.roles.fetch();

      const channels = guild.channels.cache
        .filter(c => c.type === 0 || c.type === 5)
        .map(c => ({ id: c.id, name: c.name, type: c.type }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const roles = guild.roles.cache
        .filter(r => !r.managed && r.name !== '@everyone')
        .map(r => ({
          id: r.id,
          name: r.name,
          color: r.hexColor,
          position: r.position,
        }))
        .sort((a, b) => b.position - a.position);

      res.json({ channels, roles });
    } catch (err: any) {
      console.error('Error cargando recursos:', err);
      if (err?.code === 10004 || err?.rawError?.code === 10004) {
        return res.status(404).json({ error: 'El bot no está en este servidor.' });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/test/welcome', async (req, res) => {
    const { guildId, userId } = req.body ?? {};
    if (!guildId || !userId) {
      return res.status(400).json({ error: 'guildId y userId son requeridos' });
    }
    try {
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(userId);
      await handleMemberAdd(member);
      res.json({ ok: true, message: 'Test de bienvenida enviado' });
    } catch (err: any) {
      console.error('Error en test/welcome:', err);
      if (err?.code === 10004 || err?.rawError?.code === 10004) {
        return res.status(404).json({ error: 'El bot no está en este servidor. Invítalo primero.' });
      }
      if (err?.code === 10007 || err?.rawError?.code === 10007) {
        return res.status(404).json({ error: 'El usuario no está en este servidor.' });
      }
      res.status(500).json({ error: err.message ?? 'Error desconocido' });
    }
  });

  app.post('/test/goodbye', async (req, res) => {
    const { guildId, userId } = req.body ?? {};
    if (!guildId || !userId) {
      return res.status(400).json({ error: 'guildId y userId son requeridos' });
    }
    try {
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(userId);
      await handleMemberRemove(member);
      res.json({ ok: true, message: 'Test de despedida enviado' });
    } catch (err: any) {
      console.error('Error en test/goodbye:', err);
      if (err?.code === 10004 || err?.rawError?.code === 10004) {
        return res.status(404).json({ error: 'El bot no está en este servidor. Invítalo primero.' });
      }
      if (err?.code === 10007 || err?.rawError?.code === 10007) {
        return res.status(404).json({ error: 'El usuario no está en este servidor.' });
      }
      res.status(500).json({ error: err.message ?? 'Error desconocido' });
    }
  });

  app.post('/setup-verification', async (req, res) => {
    const { guildId, channelId, roleId, message, buttonText } = req.body ?? {};
    if (!guildId || !channelId || !roleId) {
      return res.status(400).json({ error: 'Faltan datos' });
    }
    try {
      await setupVerificationMessage(client, guildId, channelId, roleId, message ?? '', buttonText ?? '✅ Verificarme');
      res.json({ ok: true, message: 'Mensaje de verificación enviado' });
    } catch (err: any) {
      console.error('Error setup-verification:', err);
      res.status(500).json({ error: err.message });
    }
  });

  const PORT = Number(process.env.BOT_API_PORT ?? 3001);
  app.listen(PORT, () => {
    console.log(`🔌 API interna del bot en http://localhost:${PORT}`);
  });
}