import { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "../db.js";
import { md5 } from "../lib/crypto.js";
import { resolveTrack } from "../lib/normalize.js";
import { config } from "../config.js";

/**
 * The legacy Audioscrobbler 1.2 protocol (the old handshake + plain-text
 * submission scheme used by foobar2000, Rockbox, mpdscribble, Amarok, and
 * basically anything that lets you point it at a "custom"/Libre.fm-style
 * scrobbling server). Plain-text request/response, no XML.
 */
export default async function legacyRoutes(app: FastifyInstance) {
  app.get("/legacy/", async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    if (q.hs !== "true") return reply.code(400).send("FAILED invalid handshake");

    const { u: username, t: timestamp, a: authToken } = q;
    if (!username || !timestamp || !authToken) {
      reply.type("text/plain");
      return "FAILED missing parameters";
    }

    const user = await prisma.user.findUnique({ where: { username } });
    reply.type("text/plain");
    if (!user) return "BADAUTH";

    const expected = md5(user.legacyPasswordMd5 + timestamp);
    if (expected !== authToken) return "BADAUTH";

    const base = config.publicUrl.replace(/\/$/, "");
    return [
      "OK",
      user.sessionKey,
      `${base}/legacy/nowplaying`,
      `${base}/legacy/submit`,
    ].join("\n");
  });

  app.post("/legacy/nowplaying", async (req, reply) => {
    const body = (req.body as Record<string, string>) ?? {};
    reply.type("text/plain");
    const user = await prisma.user.findUnique({ where: { sessionKey: body.s } });
    if (!user) return "BADSESSION";
    if (!body.a || !body.t) return "OK"; // nothing useful to do with it, don't error out clients

    const track = await resolveTrack({
      artist: body.a,
      track: body.t,
      album: body.b,
      mbid: body.m,
      durationMs: body.l ? Number(body.l) * 1000 : undefined,
      year: parseLegacyYear(body.y),
    });
    await prisma.nowPlaying.upsert({
      where: { userId: user.id },
      update: { trackId: track.id, startedAt: new Date() },
      create: { userId: user.id, trackId: track.id },
    });
    return "OK";
  });

  app.post("/legacy/submit", async (req, reply) => {
    const body = (req.body as Record<string, string>) ?? {};
    reply.type("text/plain");
    const user = await prisma.user.findUnique({ where: { sessionKey: body.s } });
    if (!user) return "BADSESSION";

    const indices = new Set<number>();
    for (const key of Object.keys(body)) {
      const m = key.match(/^[a-z]\[(\d+)]$/);
      if (m) indices.add(Number(m[1]));
    }

    for (const i of indices) {
      const artist = body[`a[${i}]`];
      const track = body[`t[${i}]`];
      const ts = body[`i[${i}]`];
      if (!artist || !track || !ts) continue;
      const resolved = await resolveTrack({
        artist,
        track,
        album: body[`b[${i}]`],
        mbid: body[`m[${i}]`],
        durationMs: body[`l[${i}]`] ? Number(body[`l[${i}]`]) * 1000 : undefined,
        year: parseLegacyYear(body[`y[${i}]`]),
      });
      await prisma.scrobble
        .create({
          data: {
            userId: user.id,
            trackId: resolved.id,
            playedAt: new Date(Number(ts) * 1000),
            source: "legacy",
          },
        })
        .catch(() => null);
    }
    return "OK";
  });
}

function parseLegacyYear(value: string | undefined): number | undefined {
  if (!value || !/^\d{4}$/.test(value)) return undefined;
  const year = Number(value);
  return year >= 1000 && year <= new Date().getFullYear() + 1 ? year : undefined;
}
