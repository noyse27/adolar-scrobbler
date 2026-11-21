import { FastifyInstance, FastifyRequest } from "fastify";
import { prisma, getOrCreateAppCredentials } from "../db.js";
import { verifyApiSig, verifyPassword } from "../lib/crypto.js";
import { resolveTrack } from "../lib/normalize.js";
import { toXml, lfmResponse } from "../lib/lastfmXml.js";

type Params = Record<string, string | undefined>;

function parseYear(value: string | undefined): number | undefined {
  if (!value || !/^\d{4}$/.test(value)) return undefined;
  const year = Number(value);
  return year >= 1000 && year <= new Date().getFullYear() + 1 ? year : undefined;
}

const ERR = {
  INVALID_PARAMS: 6,
  AUTH_FAILED: 4,
  INVALID_SESSION: 9,
  INVALID_SIGNATURE: 13,
  SERVICE_FAILED: 8,
};

function getParams(req: FastifyRequest): Params {
  const q = (req.query as Params) ?? {};
  const b = (req.method === "POST" ? (req.body as Params) : {}) ?? {};
  return { ...q, ...b };
}

function wantsJson(params: Params): boolean {
  return params.format === "json";
}

/** Converts our internal XML-shaped objects ($/_ ) to last.fm's JSON shape (@attr/#text). */
function toJsonShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toJsonShape);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === "$") out["@attr"] = toJsonShape(v);
      else if (k === "_") out["#text"] = v;
      else out[k] = toJsonShape(v);
    }
    return out;
  }
  return value;
}

function send(reply: any, params: Params, status: "ok" | "failed", body: Record<string, unknown>) {
  if (wantsJson(params)) {
    if (status === "failed") {
      const err = body.error as any;
      return reply.send({ error: Number(err?.$?.code ?? 8), message: err?._ ?? "error" });
    }
    return reply.send(toJsonShape(body));
  }
  reply.type("application/xml");
  return reply.send(toXml(lfmResponse(status, body)));
}

function fail(reply: any, params: Params, code: number, message: string) {
  reply.status(200); // last.fm itself replies 200 with status="failed" body for most API errors
  return send(reply, params, "failed", { error: { $: { code: String(code) }, _: message } });
}

/**
 * Extracts a batch of scrobbles from either indexed params (artist[0],
 * track[0], timestamp[0], ...) used for bulk submission, or bare params
 * (artist, track, timestamp) used for a single scrobble.
 */
function extractBatch(params: Params): Array<Record<string, string | undefined>> {
  const indexed = new Set<number>();
  for (const key of Object.keys(params)) {
    const m = key.match(/^\w+\[(\d+)\]$/);
    if (m) indexed.add(Number(m[1]));
  }
  if (indexed.size === 0) {
    return [
      {
        artist: params.artist,
        track: params.track,
        album: params.album,
        timestamp: params.timestamp,
        mbid: params.mbid,
        albumArtist: params.albumArtist,
        duration: params.duration,
        year: params.year,
      },
    ];
  }
  const indices = [...indexed].sort((a, b) => a - b);
  return indices.map((i) => ({
    artist: params[`artist[${i}]`],
    track: params[`track[${i}]`],
    album: params[`album[${i}]`],
    timestamp: params[`timestamp[${i}]`],
    mbid: params[`mbid[${i}]`],
    albumArtist: params[`albumArtist[${i}]`],
    duration: params[`duration[${i}]`],
    year: params[`year[${i}]`],
  }));
}

export default async function lastfm2Routes(app: FastifyInstance) {
  app.route({
    method: ["GET", "POST"],
    url: "/2.0/",
    handler: async (req, reply) => {
      const params = getParams(req);
      const method = (params.method ?? "").toLowerCase();
      const { apiKey, secret } = await getOrCreateAppCredentials();

      if (!params.api_key) return fail(reply, params, ERR.INVALID_PARAMS, "API key missing");
      if (params.api_key !== apiKey) return fail(reply, params, ERR.AUTH_FAILED, "Invalid API key");

      const SIGNED_METHODS = new Set([
        "auth.getmobilesession",
        "auth.getsession",
        "track.scrobble",
        "track.love",
        "track.unlove",
        "track.updatenowplaying",
      ]);
      if (SIGNED_METHODS.has(method) && !verifyApiSig(params, secret)) {
        return fail(reply, params, ERR.INVALID_SIGNATURE, "Invalid method signature supplied");
      }

      switch (method) {
        case "auth.gettoken": {
          const token = await prisma.authToken.create({
            data: { expiresAt: new Date(Date.now() + 1000 * 60 * 30) },
          });
          return send(reply, params, "ok", { token: token.token });
        }

        case "auth.getsession": {
          const tokenRow = params.token
            ? await prisma.authToken.findUnique({ where: { token: params.token } })
            : null;
          if (!tokenRow || !tokenRow.authorized || !tokenRow.userId) {
            return fail(reply, params, ERR.AUTH_FAILED, "Unauthorized Token");
          }
          const user = await prisma.user.findUnique({ where: { id: tokenRow.userId } });
          if (!user) return fail(reply, params, ERR.AUTH_FAILED, "Unauthorized Token");
          return send(reply, params, "ok", {
            session: { name: user.username, key: user.sessionKey, subscriber: "0" },
          });
        }

        case "auth.getmobilesession": {
          const { username, password } = params;
          if (!username || !password) return fail(reply, params, ERR.INVALID_PARAMS, "Missing parameters");
          const user = await prisma.user.findUnique({ where: { username } });
          if (!user || !(await verifyPassword(user.passwordHash, password))) {
            return fail(reply, params, ERR.AUTH_FAILED, "Invalid username/password");
          }
          return send(reply, params, "ok", {
            session: { name: user.username, key: user.sessionKey, subscriber: "0" },
          });
        }

        case "track.updatenowplaying": {
          const user = await requireSession(params, reply);
          if (!user) return;
          if (!params.artist || !params.track) {
            return fail(reply, params, ERR.INVALID_PARAMS, "Missing parameters");
          }
          const track = await resolveTrack({
            artist: params.artist,
            track: params.track,
            album: params.album,
            mbid: params.mbid,
            durationMs: params.duration ? Number(params.duration) * 1000 : undefined,
            year: parseYear(params.year),
          });
          await prisma.nowPlaying.upsert({
            where: { userId: user.id },
            update: { trackId: track.id, startedAt: new Date() },
            create: { userId: user.id, trackId: track.id },
          });
          return send(reply, params, "ok", {
            nowplaying: {
              track: { _: params.track, $: { corrected: "0" } },
              artist: { _: params.artist, $: { corrected: "0" } },
              album: { _: params.album ?? "", $: { corrected: "0" } },
              ignoredMessage: { $: { code: "0" }, _: "" },
            },
          });
        }

        case "track.scrobble": {
          const user = await requireSession(params, reply);
          if (!user) return;
          const batch = extractBatch(params).filter((s) => s.artist && s.track && s.timestamp);
          if (batch.length === 0) return fail(reply, params, ERR.INVALID_PARAMS, "Missing parameters");

          const accepted: any[] = [];
          for (const s of batch) {
            const track = await resolveTrack({
              artist: s.artist!,
              track: s.track!,
              album: s.album,
              mbid: s.mbid,
              durationMs: s.duration ? Number(s.duration) * 1000 : undefined,
              year: parseYear(s.year),
            });
            const playedAt = new Date(Number(s.timestamp) * 1000);
            await prisma.scrobble
              .create({
                data: { userId: user.id, trackId: track.id, playedAt, source: "api" },
              })
              .catch(() => null); // duplicate (same user/track/timestamp) -> silently ignore
            accepted.push({
              track: { _: s.track, $: { corrected: "0" } },
              artist: { _: s.artist, $: { corrected: "0" } },
              album: { _: s.album ?? "", $: { corrected: "0" } },
              albumArtist: { _: s.albumArtist ?? "", $: { corrected: "0" } },
              timestamp: s.timestamp,
              ignoredMessage: { $: { code: "0" }, _: "" },
            });
          }
          return send(reply, params, "ok", {
            scrobbles: {
              $: { accepted: String(accepted.length), ignored: "0" },
              scrobble: accepted.length === 1 ? accepted[0] : accepted,
            },
          });
        }

        case "track.love":
        case "track.unlove": {
          const user = await requireSession(params, reply);
          if (!user) return;
          if (!params.artist || !params.track) {
            return fail(reply, params, ERR.INVALID_PARAMS, "Missing parameters");
          }
          const track = await resolveTrack({ artist: params.artist, track: params.track });
          if (method === "track.love") {
            await prisma.love
              .create({ data: { userId: user.id, trackId: track.id } })
              .catch(() => null);
          } else {
            await prisma.love
              .deleteMany({ where: { userId: user.id, trackId: track.id } })
              .catch(() => null);
          }
          return send(reply, params, "ok", {});
        }

        case "user.getinfo": {
          const username = params.user;
          const user = username
            ? await prisma.user.findUnique({ where: { username } })
            : await requireSession(params, reply, true);
          if (!user) return fail(reply, params, ERR.INVALID_PARAMS, "User not found");
          const playcount = await prisma.scrobble.count({ where: { userId: user.id } });
          return send(reply, params, "ok", {
            user: {
              name: user.username,
              realname: user.displayName ?? "",
              playcount: String(playcount),
              registered: { $: { unixtime: String(Math.floor(user.createdAt.getTime() / 1000)) } },
            },
          });
        }

        case "user.getrecenttracks": {
          const username = params.user;
          if (!username) return fail(reply, params, ERR.INVALID_PARAMS, "Missing parameters");
          const user = await prisma.user.findUnique({ where: { username } });
          if (!user) return fail(reply, params, ERR.INVALID_PARAMS, "User not found");
          const limit = Math.min(Number(params.limit ?? 50), 200);
          const page = Math.max(Number(params.page ?? 1), 1);
          const rows = await prisma.scrobble.findMany({
            where: { userId: user.id },
            include: { track: { include: { artist: true, album: true } } },
            orderBy: { playedAt: "desc" },
            take: limit,
            skip: (page - 1) * limit,
          });
          return send(reply, params, "ok", {
            recenttracks: {
              track: rows.map((r) => ({
                name: r.track.name,
                artist: { "#text": r.track.artist.name },
                album: { "#text": r.track.album?.name ?? "" },
                date: { $: { uts: String(Math.floor(r.playedAt.getTime() / 1000)) } },
              })),
            },
          });
        }

        case "user.getlovedtracks": {
          const username = params.user;
          if (!username) return fail(reply, params, ERR.INVALID_PARAMS, "Missing parameters");
          const user = await prisma.user.findUnique({ where: { username } });
          if (!user) return fail(reply, params, ERR.INVALID_PARAMS, "User not found");
          const limit = Math.min(Math.max(Number(params.limit ?? 50), 1), 200);
          const page = Math.max(Number(params.page ?? 1), 1);
          const total = await prisma.love.count({ where: { userId: user.id } });
          const rows = await prisma.love.findMany({
            where: { userId: user.id },
            include: { track: { include: { artist: true } } },
            orderBy: { lovedAt: "desc" },
            take: limit,
            skip: (page - 1) * limit,
          });
          return send(reply, params, "ok", {
            lovedtracks: {
              $: {
                user: user.username,
                page: String(page),
                perPage: String(limit),
                totalPages: String(Math.ceil(total / limit)),
                total: String(total),
              },
              track: rows.map((r) => ({
                name: r.track.name,
                artist: { name: r.track.artist.name },
                date: { $: { uts: String(Math.floor(r.lovedAt.getTime() / 1000)) } },
              })),
            },
          });
        }

        default:
          return fail(reply, params, ERR.INVALID_PARAMS, "No method with that name in this package");
      }
    },
  });

  async function requireSession(params: Params, reply: any, soft = false) {
    const sk = params.sk;
    if (!sk) {
      if (!soft) fail(reply, params, ERR.INVALID_SESSION, "Invalid session key");
      return null;
    }
    const user = await prisma.user.findUnique({ where: { sessionKey: sk } });
    if (!user) {
      if (!soft) fail(reply, params, ERR.INVALID_SESSION, "Invalid session key");
      return null;
    }
    return user;
  }
}
