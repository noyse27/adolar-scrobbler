import { FastifyInstance } from "fastify";
import { getCurrentUser } from "../lib/webAuth.js";
import { getInstanceSetting, setInstanceSetting, getOrCreateAppCredentials } from "../db.js";

export default async function adminRoutes(app: FastifyInstance) {
  app.get("/api/admin/settings", async (req, reply) => {
    const user = await getCurrentUser(req);
    if (!user || user.role !== "ADMIN") return reply.code(403).send({ error: "forbidden" });
    const lastfmApiKey = await getInstanceSetting("lastfm_api_key");
    const { apiKey } = await getOrCreateAppCredentials();
    return {
      lastfmApiKeyConfigured: Boolean(lastfmApiKey),
      appApiKey: apiKey,
    };
  });

  app.post<{ Body: { lastfmApiKey: string } }>("/api/admin/settings/lastfm-key", async (req, reply) => {
    const user = await getCurrentUser(req);
    if (!user || user.role !== "ADMIN") return reply.code(403).send({ error: "forbidden" });
    const key = req.body?.lastfmApiKey?.trim();
    if (!key) return reply.code(400).send({ error: "missing_key" });
    await setInstanceSetting("lastfm_api_key", key);
    return { ok: true };
  });
}
