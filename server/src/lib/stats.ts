import { prisma } from "../db.js";

export type Range = "7d" | "30d" | "90d" | "365d" | "all";

export function rangeToDate(range: Range): Date | null {
  const days = { "7d": 7, "30d": 30, "90d": 90, "365d": 365, all: null }[range];
  if (days === null) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function whereClause(userId: string, since: Date | null) {
  return since
    ? { userId, playedAt: { gte: since } }
    : { userId };
}

export async function getOverview(userId: string, range: Range) {
  const since = rangeToDate(range);
  const where = whereClause(userId, since);

  const [totalScrobbles, artists, tracks, albums, durationAgg] = await Promise.all([
    prisma.scrobble.count({ where }),
    prisma.scrobble.findMany({ where, select: { track: { select: { artistId: true } } }, distinct: ["trackId"] }),
    prisma.scrobble.findMany({ where, select: { trackId: true }, distinct: ["trackId"] }),
    prisma.scrobble.findMany({
      where,
      select: { track: { select: { albumId: true } } },
      distinct: ["trackId"],
    }),
    prisma.scrobble.findMany({
      where,
      select: { track: { select: { durationMs: true } } },
    }),
  ]);

  const uniqueArtists = new Set(artists.map((a) => a.track.artistId)).size;
  const uniqueAlbums = new Set(albums.map((a) => a.track.albumId).filter(Boolean)).size;
  const DEFAULT_TRACK_MS = 3.5 * 60 * 1000;
  const totalMs = durationAgg.reduce((sum, s) => sum + (s.track.durationMs ?? DEFAULT_TRACK_MS), 0);

  return {
    totalScrobbles,
    uniqueArtists,
    uniqueTracks: tracks.length,
    uniqueAlbums,
    estimatedListeningMs: totalMs,
  };
}

export async function getTopArtists(userId: string, range: Range, limit = 20) {
  const since = rangeToDate(range);
  const rows = await prisma.$queryRawUnsafe<
    { artistId: string; name: string; playcount: bigint }[]
  >(
    `SELECT a.id as "artistId", a.name, COUNT(*)::bigint as playcount
     FROM "Scrobble" s
     JOIN "Track" t ON t.id = s."trackId"
     JOIN "Artist" a ON a.id = t."artistId"
     WHERE s."userId" = $1 ${since ? `AND s."playedAt" >= $3` : ""}
     GROUP BY a.id, a.name
     ORDER BY playcount DESC
     LIMIT $2`,
    userId,
    limit,
    ...(since ? [since] : [])
  );
  return rows.map((r) => ({ artistId: r.artistId, name: r.name, playcount: Number(r.playcount) }));
}

export async function getTopAlbums(userId: string, range: Range, limit = 20) {
  const since = rangeToDate(range);
  const rows = await prisma.$queryRawUnsafe<
    { albumId: string; name: string; artist: string; playcount: bigint }[]
  >(
    `SELECT al.id as "albumId", al.name, ar.name as artist, COUNT(*)::bigint as playcount
     FROM "Scrobble" s
     JOIN "Track" t ON t.id = s."trackId"
     JOIN "Album" al ON al.id = t."albumId"
     JOIN "Artist" ar ON ar.id = al."artistId"
     WHERE s."userId" = $1 ${since ? `AND s."playedAt" >= $3` : ""}
     GROUP BY al.id, al.name, ar.name
     ORDER BY playcount DESC
     LIMIT $2`,
    userId,
    limit,
    ...(since ? [since] : [])
  );
  return rows.map((r) => ({
    albumId: r.albumId,
    name: r.name,
    artist: r.artist,
    playcount: Number(r.playcount),
  }));
}

export async function getTopTracks(userId: string, range: Range, limit = 20) {
  const since = rangeToDate(range);
  const rows = await prisma.$queryRawUnsafe<
    { trackId: string; name: string; artist: string; playcount: bigint }[]
  >(
    `SELECT t.id as "trackId", t.name, ar.name as artist, COUNT(*)::bigint as playcount
     FROM "Scrobble" s
     JOIN "Track" t ON t.id = s."trackId"
     JOIN "Artist" ar ON ar.id = t."artistId"
     WHERE s."userId" = $1 ${since ? `AND s."playedAt" >= $3` : ""}
     GROUP BY t.id, t.name, ar.name
     ORDER BY playcount DESC
     LIMIT $2`,
    userId,
    limit,
    ...(since ? [since] : [])
  );
  return rows.map((r) => ({
    trackId: r.trackId,
    name: r.name,
    artist: r.artist,
    playcount: Number(r.playcount),
  }));
}

export async function getRecentScrobbles(userId: string, limit = 30, page = 1) {
  return prisma.scrobble.findMany({
    where: { userId },
    include: { track: { include: { artist: true, album: true } } },
    orderBy: { playedAt: "desc" },
    take: limit,
    skip: (page - 1) * limit,
  });
}

export async function getHeatmap(userId: string, year: number) {
  const rows = await prisma.$queryRawUnsafe<{ day: Date; count: bigint }[]>(
    `SELECT date_trunc('day', "playedAt") as day, COUNT(*)::bigint as count
     FROM "Scrobble"
     WHERE "userId" = $1 AND "playedAt" >= $2 AND "playedAt" < $3
     GROUP BY day
     ORDER BY day`,
    userId,
    new Date(`${year}-01-01T00:00:00Z`),
    new Date(`${year + 1}-01-01T00:00:00Z`)
  );
  return rows.map((r) => ({ date: r.day.toISOString().slice(0, 10), count: Number(r.count) }));
}

export async function getClock(userId: string) {
  const [hours, weekdays] = await Promise.all([
    prisma.$queryRawUnsafe<{ hour: number; count: bigint }[]>(
      `SELECT EXTRACT(HOUR FROM "playedAt")::int as hour, COUNT(*)::bigint as count
       FROM "Scrobble" WHERE "userId" = $1 GROUP BY hour ORDER BY hour`,
      userId
    ),
    prisma.$queryRawUnsafe<{ weekday: number; count: bigint }[]>(
      `SELECT EXTRACT(DOW FROM "playedAt")::int as weekday, COUNT(*)::bigint as count
       FROM "Scrobble" WHERE "userId" = $1 GROUP BY weekday ORDER BY weekday`,
      userId
    ),
  ]);
  const hourly = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    count: Number(hours.find((r) => r.hour === h)?.count ?? 0),
  }));
  const weekly = Array.from({ length: 7 }, (_, d) => ({
    weekday: d,
    count: Number(weekdays.find((r) => r.weekday === d)?.count ?? 0),
  }));
  return { hourly, weekly };
}

export async function getStreaks(userId: string) {
  const days = await prisma.$queryRawUnsafe<{ day: Date }[]>(
    `SELECT DISTINCT date_trunc('day', "playedAt") as day
     FROM "Scrobble" WHERE "userId" = $1 ORDER BY day`,
    userId
  );
  if (days.length === 0) return { currentStreak: 0, longestStreak: 0 };

  const dayNums = days.map((d) => Math.floor(d.day.getTime() / 86400000));
  let longest = 1;
  let run = 1;
  for (let i = 1; i < dayNums.length; i++) {
    if (dayNums[i] === dayNums[i - 1] + 1) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 1;
    }
  }

  const today = Math.floor(Date.now() / 86400000);
  let current = 0;
  let cursor = today;
  const daySet = new Set(dayNums);
  // allow "today" to not have a scrobble yet without breaking the streak
  if (!daySet.has(cursor)) cursor -= 1;
  while (daySet.has(cursor)) {
    current += 1;
    cursor -= 1;
  }

  return { currentStreak: current, longestStreak: longest };
}

/** Shannon entropy of the artist play distribution, normalized to 0-1. */
export async function getDiversity(userId: string) {
  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint as count FROM "Scrobble" s
     JOIN "Track" t ON t.id = s."trackId"
     WHERE s."userId" = $1 GROUP BY t."artistId"`,
    userId
  );
  const total = rows.reduce((sum, r) => sum + Number(r.count), 0);
  if (total === 0 || rows.length <= 1) return { entropy: 0, uniqueArtists: rows.length };

  let entropy = 0;
  for (const r of rows) {
    const p = Number(r.count) / total;
    entropy -= p * Math.log2(p);
  }
  const maxEntropy = Math.log2(rows.length);
  return { entropy: maxEntropy > 0 ? entropy / maxEntropy : 0, uniqueArtists: rows.length };
}

export async function getTopArtistShare(userId: string) {
  const top = await getTopArtists(userId, "all", 10);
  const total = await prisma.scrobble.count({ where: { userId } });
  if (total === 0) return { top1: 0, top5: 0, top10: 0 };
  const sum = (n: number) => top.slice(0, n).reduce((s, a) => s + a.playcount, 0);
  return {
    top1: sum(1) / total,
    top5: sum(5) / total,
    top10: sum(10) / total,
  };
}

export async function getOnThisDay(userId: string) {
  const now = new Date();
  const rows = await prisma.$queryRawUnsafe<
    { year: number; artist: string; track: string; playedAt: Date }[]
  >(
    `SELECT EXTRACT(YEAR FROM s."playedAt")::int as year, ar.name as artist, t.name as track, s."playedAt"
     FROM "Scrobble" s
     JOIN "Track" t ON t.id = s."trackId"
     JOIN "Artist" ar ON ar.id = t."artistId"
     WHERE s."userId" = $1
       AND EXTRACT(MONTH FROM s."playedAt") = $2
       AND EXTRACT(DAY FROM s."playedAt") = $3
       AND EXTRACT(YEAR FROM s."playedAt") < $4
     ORDER BY s."playedAt" DESC
     LIMIT 50`,
    userId,
    now.getMonth() + 1,
    now.getDate(),
    now.getFullYear()
  );
  return rows;
}

export async function getNightOwlScore(userId: string) {
  const { hourly } = await getClock(userId);
  const total = hourly.reduce((s, h) => s + h.count, 0);
  if (total === 0) return 0;
  const night = hourly
    .filter((h) => h.hour >= 22 || h.hour < 5)
    .reduce((s, h) => s + h.count, 0);
  return night / total;
}

export async function getDiscoveryRate(userId: string) {
  const rows = await prisma.$queryRawUnsafe<{ month: Date; newArtists: bigint }[]>(
    `WITH first_play AS (
       SELECT t."artistId", MIN(s."playedAt") as first_at
       FROM "Scrobble" s JOIN "Track" t ON t.id = s."trackId"
       WHERE s."userId" = $1
       GROUP BY t."artistId"
     )
     SELECT date_trunc('month', first_at) as month, COUNT(*)::bigint as "newArtists"
     FROM first_play
     GROUP BY month
     ORDER BY month DESC
     LIMIT 12`,
    userId
  );
  return rows.map((r) => ({ month: r.month.toISOString().slice(0, 7), newArtists: Number(r.newArtists) }));
}

export async function getInstanceLeaderboard() {
  const rows = await prisma.$queryRawUnsafe<
    { username: string; displayName: string | null; playcount: bigint }[]
  >(
    `SELECT u.username, u."displayName", COUNT(*)::bigint as playcount
     FROM "Scrobble" s JOIN "User" u ON u.id = s."userId"
     GROUP BY u.id, u.username, u."displayName"
     ORDER BY playcount DESC
     LIMIT 50`
  );
  return rows.map((r) => ({
    username: r.username,
    displayName: r.displayName,
    playcount: Number(r.playcount),
  }));
}
