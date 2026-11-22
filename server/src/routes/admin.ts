import { FastifyInstance } from "fastify";
import { getCurrentUser } from "../lib/webAuth.js";
import { prisma, getInstanceSetting, setInstanceSetting, getOrCreateAppCredentials } from "../db.js";
import { getAllowRegistration, setAllowRegistration, createInvite } from "../lib/registration.js";
import { config } from "../config.js";

async function requireAdmin(req: any, reply: any) {
  const user = await getCurrentUser(req);
  if (!user || user.role !== "ADMIN") {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user;
}

export default async function adminRoutes(app: FastifyInstance) {
  app.get("/api/admin/settings", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const lastfmApiKey = await getInstanceSetting("lastfm_api_key");
    const { apiKey, secret } = await getOrCreateAppCredentials();
    const [enrichmentJobs, enrichedTracks, cachedCovers] = await Promise.all([
      prisma.enrichmentJob.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.track.count({ where: { mbid: { not: null } } }),
      prisma.album.count({ where: { coverPath: { not: null } } }),
    ]);
    return {
      lastfmApiKeyConfigured: Boolean(lastfmApiKey),
      appApiKey: apiKey,
      // The shared secret is normally never handed to clients (same as a
      // real last.fm API application's secret) - it's exposed here, to
      // admins only, so the same person who runs this instance can plug it
      // into another app they also control (Adolar web/Next) that wants to
      // scrobble here using the signed 2.0 API.
      appSecret: secret,
      allowRegistration: await getAllowRegistration(),
      musicBrainz: {
        enabled: config.musicBrainzEnabled,
        contactConfigured: Boolean(config.musicBrainzContact.trim()),
        enrichedTracks,
        cachedCovers,
        jobs: Object.fromEntries(enrichmentJobs.map((row) => [row.status, row._count._all])),
      },
    };
  });

  app.post("/api/admin/musicbrainz/retry", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const result = await prisma.enrichmentJob.updateMany({
      where: { status: { in: ["FAILED", "NO_MATCH"] } },
      data: { status: "RETRY", attempts: 0, nextAttemptAt: new Date(), lastError: null },
    });
    return { ok: true, queued: result.count };
  });

  app.post<{ Body: { lastfmApiKey: string } }>("/api/admin/settings/lastfm-key", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const key = req.body?.lastfmApiKey?.trim();
    if (!key) return reply.code(400).send({ error: "missing_key" });
    await setInstanceSetting("lastfm_api_key", key);
    return { ok: true };
  });

  app.post<{ Body: { allow: boolean } }>("/api/admin/settings/registration", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    await setAllowRegistration(Boolean(req.body?.allow));
    return { ok: true };
  });

  app.get("/api/admin/invites", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const invites = await prisma.inviteCode.findMany({
      orderBy: { createdAt: "desc" },
      include: { registeredUsers: { select: { username: true } } },
    });
    return invites.map((i) => ({
      id: i.id,
      token: i.token,
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
      maxUses: i.maxUses,
      usedCount: i.usedCount,
      revoked: i.revoked,
      registeredUsernames: i.registeredUsers.map((u) => u.username),
    }));
  });

  app.post<{ Body: { expiresInHours?: number; maxUses?: number } }>(
    "/api/admin/invites",
    async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const invite = await createInvite({
        createdById: admin.id,
        expiresInHours: req.body?.expiresInHours,
        maxUses: req.body?.maxUses,
      });
      return invite;
    }
  );

  app.post<{ Params: { id: string } }>("/api/admin/invites/:id/revoke", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    await prisma.inviteCode.update({ where: { id: req.params.id }, data: { revoked: true } });
    return { ok: true };
  });
}
