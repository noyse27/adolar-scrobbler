import { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { getCurrentUser } from "../lib/webAuth.js";
import {
  Range,
  rangeToDate,
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

function boundedInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

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
      return getTopArtists(user.id, range(req.query), boundedInt(req.query.limit, 20, 1, 100));
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
      return getTopAlbums(user.id, range(req.query), boundedInt(req.query.limit, 20, 1, 100));
    }
  );

  app.get<{ Params: { username: string }; Querystring: { range?: string; limit?: string } }>(
    "/api/users/:username/charts/tracks",
    async (req, reply) => {
      const user = await resolveUser(req.params.username);
      if (!user) return reply.code(404).send({ error: "not_found" });
      return getTopTracks(user.id, range(req.query), boundedInt(req.query.limit, 20, 1, 100));
    }
  );

  app.get<{ Params: { username: string }; Querystring: { limit?: string; page?: string } }>(
    "/api/users/:username/recent",
    async (req, reply) => {
      const user = await resolveUser(req.params.username);
      if (!user) return reply.code(404).send({ error: "not_found" });
      const rows = await getRecentScrobbles(
        user.id,
        boundedInt(req.query.limit, 30, 1, 200),
        boundedInt(req.query.page, 1, 1, 100_000)
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
          artistId: r.track.artist.id,
          album: r.track.album?.name ?? null,
          albumId: r.track.album?.id ?? null,
          year: r.track.year,
          coverUrl: r.track.album?.coverPath ? `/media/covers/${r.track.album.coverPath}` : null,
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
      artistId: l.track.artist.id,
      album: l.track.album?.name ?? null,
      albumId: l.track.album?.id ?? null,
      year: l.track.year,
      coverUrl: l.track.album?.coverPath ? `/media/covers/${l.track.album.coverPath}` : null,
      lovedAt: l.lovedAt,
    }));
  });

  app.get<{ Params: { username: string }; Querystring: { year?: string } }>(
    "/api/users/:username/heatmap",
    async (req, reply) => {
      const user = await resolveUser(req.params.username);
      if (!user) return reply.code(404).send({ error: "not_found" });
      return getHeatmap(user.id, boundedInt(req.query.year, new Date().getFullYear(), 1970, 2200));
    }
  );

  app.get<{ Params: { username: string } }>("/api/users/:username/clock", async (req, reply) => {
    const user = await resolveUser(req.params.username);
    if (!user) return reply.code(404).send({ error: "not_found" });
    return getClock(user.id);
  });

  app.get<{ Params: { username: string }; Querystring: { range?: string } }>(
    "/api/users/:username/charts/genres",
    async (req, reply) => {
      const user = await resolveUser(req.params.username);
      if (!user) return reply.code(404).send({ error: "not_found" });
      const since = rangeToDate(range(req.query));
      const rows = await prisma.$queryRawUnsafe<{ name: string; playcount: bigint }[]>(
        `SELECT genre as name, COUNT(*)::bigint as playcount
         FROM "Scrobble" s
         JOIN "Track" t ON t.id = s."trackId"
         JOIN "Artist" a ON a.id = t."artistId"
         CROSS JOIN LATERAL unnest(a.genres) AS genre
         WHERE s."userId" = $1 ${since ? `AND s."playedAt" >= $2` : ""}
         GROUP BY genre
         ORDER BY playcount DESC, genre
         LIMIT 15`,
        user.id,
        ...(since ? [since] : [])
      );
      const coverage = await prisma.$queryRawUnsafe<{ total: bigint; known: bigint }[]>(
        `SELECT COUNT(*)::bigint AS total,
                COUNT(*) FILTER (WHERE cardinality(a.genres) > 0)::bigint AS known
         FROM "Scrobble" s
         JOIN "Track" t ON t.id = s."trackId"
         JOIN "Artist" a ON a.id = t."artistId"
         WHERE s."userId" = $1 ${since ? `AND s."playedAt" >= $2` : ""}`,
        user.id,
        ...(since ? [since] : [])
      );
      const total = Number(coverage[0]?.total ?? 0);
      const known = Number(coverage[0]?.known ?? 0);
      return {
        genres: rows.map((row) => ({ name: row.name, playcount: Number(row.playcount) })),
        coverage: { total, known, ratio: total ? known / total : 0 },
      };
    }
  );

  app.get<{ Params: { id: string }; Querystring: { username?: string } }>(
    "/api/artists/:id",
    async (req, reply) => {
      const artist = await prisma.artist.findUnique({ where: { id: req.params.id } });
      if (!artist) return reply.code(404).send({ error: "not_found" });
      const user = req.query.username ? await resolveUser(req.query.username) : null;
      const where = user ? { userId: user.id, track: { artistId: artist.id } } : { track: { artistId: artist.id } };
      const [summary, topTracks, albums] = await Promise.all([
        prisma.scrobble.aggregate({ where, _count: { _all: true }, _min: { playedAt: true }, _max: { playedAt: true } }),
        prisma.scrobble.groupBy({
          by: ["trackId"], where, _count: { _all: true }, orderBy: { _count: { trackId: "desc" } }, take: 10,
        }),
        prisma.album.findMany({ where: { artistId: artist.id }, orderBy: [{ firstReleaseDate: "asc" }, { name: "asc" }] }),
      ]);
      const trackRows = await prisma.track.findMany({
        where: { id: { in: topTracks.map((row) => row.trackId) } }, include: { album: true },
      });
      const tracksById = new Map(trackRows.map((track) => [track.id, track]));
      return {
        ...artist,
        musicBrainzUrl: artist.mbid ? `https://musicbrainz.org/artist/${artist.mbid}` : null,
        stats: { playcount: summary._count._all, firstPlayedAt: summary._min.playedAt, lastPlayedAt: summary._max.playedAt },
        topTracks: topTracks.map((row) => ({
          trackId: row.trackId,
          name: tracksById.get(row.trackId)?.name ?? "Unbekannt",
          album: tracksById.get(row.trackId)?.album?.name ?? null,
          playcount: row._count._all,
        })),
        albums: albums.map((album) => ({
          id: album.id, name: album.name, year: album.firstReleaseDate?.slice(0, 4) ?? null,
          type: album.primaryType, coverUrl: album.coverPath ? `/media/covers/${album.coverPath}` : null,
        })),
      };
    }
  );

  app.get<{ Params: { id: string }; Querystring: { username?: string } }>(
    "/api/albums/:id",
    async (req, reply) => {
      const album = await prisma.album.findUnique({ where: { id: req.params.id }, include: { artist: true, tracks: true } });
      if (!album) return reply.code(404).send({ error: "not_found" });
      const user = req.query.username ? await resolveUser(req.query.username) : null;
      const where = user ? { userId: user.id, track: { albumId: album.id } } : { track: { albumId: album.id } };
      const [summary, counts] = await Promise.all([
        prisma.scrobble.aggregate({ where, _count: { _all: true }, _min: { playedAt: true }, _max: { playedAt: true } }),
        prisma.scrobble.groupBy({ by: ["trackId"], where, _count: { _all: true } }),
      ]);
      const countByTrack = new Map(counts.map((row) => [row.trackId, row._count._all]));
      return {
        id: album.id, name: album.name, artist: album.artist.name, artistId: album.artist.id,
        firstReleaseDate: album.firstReleaseDate, primaryType: album.primaryType,
        secondaryTypes: album.secondaryTypes,
        coverUrl: album.coverPath ? `/media/covers/${album.coverPath}` : null,
        musicBrainzUrl: album.releaseGroupMbid ? `https://musicbrainz.org/release-group/${album.releaseGroupMbid}` : null,
        stats: { playcount: summary._count._all, firstPlayedAt: summary._min.playedAt, lastPlayedAt: summary._max.playedAt },
        tracks: album.tracks.map((track) => ({
          id: track.id, name: track.name, durationMs: track.durationMs,
          credits: track.artistCredits, playcount: countByTrack.get(track.id) ?? 0,
        })).sort((a, b) => b.playcount - a.playcount || a.name.localeCompare(b.name)),
      };
    }
  );

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
