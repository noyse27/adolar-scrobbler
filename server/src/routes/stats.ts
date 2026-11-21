import { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { getCurrentUser } from "../lib/webAuth.js";
import {
  Range,
  getOverview,
  getTopArtists,
  getTopAlbums,
  getTopTracks,
  getReleaseYearStats,
  getRecentScrobbles,
  getHeatmap,
  getClock,
  getStreaks,
  getDiversity,
  getTopArtistShare,
  getOnThisDay,
  getNightOwlScore,
  getDiscoveryRate,
  getInstanceLeaderboard,
} from "../lib/stats.js";

const RANGES: Range[] = ["7d", "30d", "90d", "365d", "all"];

export default async function statsRoutes(app: FastifyInstance) {
  async function resolveUser(username: string) {
    return prisma.user.findUnique({ where: { username } });
  }

  function range(q: Record<string, unknown>): Range {
    const r = q.range as string;
    return RANGES.includes(r as Range) ? (r as Range) : "30d";
  }

  app.get<{ Params: { username: string }; Querystring: { range?: string } }>(
    "/api/users/:username/overview",
    async (req, reply) => {
      const user = await resolveUser(req.params.username);
      if (!user) return reply.code(404).send({ error: "not_found" });
      return getOverview(user.id, range(req.query));
    }
  );

  app.get<{ Params: { username: string }; Querystring: { range?: string; limit?: string } }>(
    "/api/users/:username/charts/artists",
    async (req, reply) => {
      const user = await resolveUser(req.params.username);
      if (!user) return reply.code(404).send({ error: "not_found" });
      return getTopArtists(user.id, range(req.query), Number(req.query.limit ?? 20));
    }
  );

  app.get<{ Params: { username: string }; Querystring: { range?: string } }>(
    "/api/users/:username/charts/release-years",
    async (req, reply) => {
      const user = await resolveUser(req.params.username);
      if (!user) return reply.code(404).send({ error: "not_found" });
      return getReleaseYearStats(user.id, range(req.query));
    }
  );

  app.get<{ Params: { username: string }; Querystring: { range?: string; limit?: string } }>(
    "/api/users/:username/charts/albums",
    async (req, reply) => {
      const user = await resolveUser(req.params.username);
      if (!user) return reply.code(404).send({ error: "not_found" });
      return getTopAlbums(user.id, range(req.query), Number(req.query.limit ?? 20));
    }
  );

  app.get<{ Params: { username: string }; Querystring: { range?: string; limit?: string } }>(
    "/api/users/:username/charts/tracks",
    async (req, reply) => {
      const user = await resolveUser(req.params.username);
      if (!user) return reply.code(404).send({ error: "not_found" });
      return getTopTracks(user.id, range(req.query), Number(req.query.limit ?? 20));
    }
  );

  app.get<{ Params: { username: string }; Querystring: { limit?: string; page?: string } }>(
    "/api/users/:username/recent",
    async (req, reply) => {
      const user = await resolveUser(req.params.username);
      if (!user) return reply.code(404).send({ error: "not_found" });
      const rows = await getRecentScrobbles(
        user.id,
        Number(req.query.limit ?? 30),
        Number(req.query.page ?? 1)
      );
      const loved = new Set(
        (
          await prisma.love.findMany({
            where: { userId: user.id, trackId: { in: rows.map((r) => r.trackId) } },
            select: { trackId: true },
          })
        ).map((l) => l.trackId)
      );
      const nowPlaying = await prisma.nowPlaying.findUnique({
        where: { userId: user.id },
        include: { track: { include: { artist: true, album: true } } },
      });
      return {
        nowPlaying:
          nowPlaying && Date.now() - nowPlaying.startedAt.getTime() < 10 * 60 * 1000
            ? {
                track: nowPlaying.track.name,
                artist: nowPlaying.track.artist.name,
                album: nowPlaying.track.album?.name ?? null,
                year: nowPlaying.track.year,
                startedAt: nowPlaying.startedAt,
              }
            : null,
        scrobbles: rows.map((r) => ({
          id: r.id,
          track: r.track.name,
          trackId: r.trackId,
          artist: r.track.artist.name,
          album: r.track.album?.name ?? null,
          year: r.track.year,
          playedAt: r.playedAt,
          loved: loved.has(r.trackId),
        })),
      };
    }
  );

  app.get<{ Params: { username: string } }>("/api/users/:username/loves", async (req, reply) => {
    const user = await resolveUser(req.params.username);
    if (!user) return reply.code(404).send({ error: "not_found" });
    const loves = await prisma.love.findMany({
      where: { userId: user.id },
      include: { track: { include: { artist: true, album: true } } },
      orderBy: { lovedAt: "desc" },
    });
    return loves.map((l) => ({
      trackId: l.trackId,
      track: l.track.name,
      artist: l.track.artist.name,
      album: l.track.album?.name ?? null,
      year: l.track.year,
      lovedAt: l.lovedAt,
    }));
  });

  app.get<{ Params: { username: string }; Querystring: { year?: string } }>(
    "/api/users/:username/heatmap",
    async (req, reply) => {
      const user = await resolveUser(req.params.username);
      if (!user) return reply.code(404).send({ error: "not_found" });
      return getHeatmap(user.id, Number(req.query.year ?? new Date().getFullYear()));
    }
  );

  app.get<{ Params: { username: string } }>("/api/users/:username/clock", async (req, reply) => {
    const user = await resolveUser(req.params.username);
    if (!user) return reply.code(404).send({ error: "not_found" });
    return getClock(user.id);
  });

  app.get<{ Params: { username: string } }>("/api/users/:username/wild", async (req, reply) => {
    const user = await resolveUser(req.params.username);
    if (!user) return reply.code(404).send({ error: "not_found" });
    const [streaks, diversity, share, onThisDay, nightOwl, discovery] = await Promise.all([
      getStreaks(user.id),
      getDiversity(user.id),
      getTopArtistShare(user.id),
      getOnThisDay(user.id),
      getNightOwlScore(user.id),
      getDiscoveryRate(user.id),
    ]);
    return { streaks, diversity, share, onThisDay, nightOwl, discovery };
  });

  app.get("/api/leaderboard", async () => getInstanceLeaderboard());

  // -- actions that require the logged-in web user --

  app.post<{ Body: { artist: string; track: string } }>("/api/me/love", async (req, reply) => {
    const user = await getCurrentUser(req);
    if (!user) return reply.code(401).send({ error: "unauthenticated" });
    const { resolveTrack } = await import("../lib/normalize.js");
    const track = await resolveTrack({ artist: req.body.artist, track: req.body.track });
    await prisma.love.upsert({
      where: { userId_trackId: { userId: user.id, trackId: track.id } },
      update: {},
      create: { userId: user.id, trackId: track.id },
    });
    return { ok: true };
  });

  app.post<{ Body: { trackId: string } }>("/api/me/unlove", async (req, reply) => {
    const user = await getCurrentUser(req);
    if (!user) return reply.code(401).send({ error: "unauthenticated" });
    await prisma.love.deleteMany({ where: { userId: user.id, trackId: req.body.trackId } });
    return { ok: true };
  });
}
