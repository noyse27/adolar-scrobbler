import { FastifyInstance } from "fastify";
import { getCurrentUser } from "../lib/webAuth.js";
import { prisma, getInstanceSetting, setInstanceSetting, getOrCreateAppCredentials } from "../db.js";
import { getAllowRegistration, setAllowRegistration, createInvite } from "../lib/registration.js";
import { config } from "../config.js";
import { applyMusicBrainzContact, isValidMusicBrainzContact } from "../lib/musicbrainz.js";

const MUSICBRAINZ_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    const savedMusicBrainzContact = await getInstanceSetting("musicbrainz_contact");
    const musicBrainzContact = savedMusicBrainzContact ?? config.musicBrainzContact.trim();
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
        contact: musicBrainzContact,
        contactConfigured: Boolean(musicBrainzContact),
        enrichedTracks,
        cachedCovers,
        jobs: Object.fromEntries(enrichmentJobs.map((row) => [row.status, row._count._all])),
      },
    };
  });

  app.post<{ Body: { contact?: string } }>("/api/admin/settings/musicbrainz-contact", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const contact = req.body?.contact?.trim() ?? "";
    if (!isValidMusicBrainzContact(contact)) {
      return reply.code(400).send({ error: "invalid_musicbrainz_contact" });
    }
    await setInstanceSetting("musicbrainz_contact", contact);
    applyMusicBrainzContact(contact);
    return { ok: true };
  });

  app.post("/api/admin/musicbrainz/retry", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const result = await prisma.enrichmentJob.updateMany({
      where: { status: { in: ["FAILED", "NO_MATCH"] } },
      data: { status: "RETRY", attempts: 0, nextAttemptAt: new Date(), lastError: null },
    });
    return { ok: true, queued: result.count };
  });

  app.get("/api/admin/musicbrainz/candidates", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const jobs = await prisma.enrichmentJob.findMany({
      where: { status: "NO_MATCH" },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    const tracks = await prisma.track.findMany({
      where: { id: { in: jobs.map((job) => job.targetId) } },
      include: { artist: true, album: true },
    });
    const tracksById = new Map(tracks.map((track) => [track.id, track]));
    return jobs.map((job) => {
      const track = tracksById.get(job.targetId);
      return {
        id: job.id,
        track: track?.name ?? "Unbekannt",
        artist: track?.artist.name ?? "Unbekannt",
        album: track?.album?.name ?? null,
        candidates: job.candidates,
      };
    });
  });

  app.post<{ Params: { id: string }; Body: { recordingMbid?: string } }>(
    "/api/admin/musicbrainz/jobs/:id/select",
    async (req, reply) => {
      if (!(await requireAdmin(req, reply))) return;
      const recordingMbid = req.body?.recordingMbid?.trim();
      if (!recordingMbid || !MUSICBRAINZ_ID.test(recordingMbid)) {
        return reply.code(400).send({ error: "invalid_mbid" });
      }
      const job = await prisma.enrichmentJob.findUnique({ where: { id: req.params.id } });
      if (!job || job.targetType !== "TRACK") return reply.code(404).send({ error: "not_found" });
      await prisma.$transaction([
        prisma.track.update({ where: { id: job.targetId }, data: { mbid: recordingMbid } }),
        prisma.enrichmentJob.update({
          where: { id: job.id },
          data: { status: "RETRY", attempts: 0, nextAttemptAt: new Date(), lastError: null },
        }),
      ]);
      return { ok: true };
    }
  );

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
