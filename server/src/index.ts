import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import staticPlugin from "@fastify/static";
import rateLimit from "@fastify/rate-limit";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import authRoutes from "./routes/auth.js";
import lastfm2Routes from "./routes/lastfm2.js";
import legacyRoutes from "./routes/legacy.js";
import statsRoutes from "./routes/stats.js";
import importRoutes from "./routes/import.js";
import adminRoutes from "./routes/admin.js";
import { startMusicBrainzWorker, stopMusicBrainzWorker } from "./lib/musicbrainz.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cookie, { secret: config.cookieSecret });
  const publicOrigin = new URL(config.publicUrl).origin;
  await app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      if (!origin || origin === publicOrigin) return callback(null, true);
      if (process.env.NODE_ENV !== "production" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
  });
  await app.register(formbody);
  await app.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: "1 minute",
  });

  await app.register(authRoutes);
  await app.register(lastfm2Routes);
  await app.register(legacyRoutes);
  await app.register(statsRoutes);
  await app.register(importRoutes);
  await app.register(adminRoutes);

  app.get("/healthz", async () => ({ ok: true }));
  app.addHook("onClose", async () => stopMusicBrainzWorker());

  app.get<{ Params: { filename: string } }>("/media/covers/:filename", async (req, reply) => {
    if (!/^[0-9a-f-]{36}-250\.jpg$/i.test(req.params.filename)) {
      return reply.code(404).send({ error: "not_found" });
    }
    const coverPath = path.resolve(config.coverCacheDir, req.params.filename);
    const cacheRoot = path.resolve(config.coverCacheDir) + path.sep;
    if (!coverPath.startsWith(cacheRoot) || !fs.existsSync(coverPath)) {
      return reply.code(404).send({ error: "not_found" });
    }
    reply.header("Cache-Control", "public, max-age=604800, immutable");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Security-Policy", "default-src 'none'");
    reply.type("image/jpeg");
    return reply.send(fs.createReadStream(coverPath));
  });

  const webDist = path.resolve(__dirname, config.webDistPath);
  const hasWebDist = fs.existsSync(path.join(webDist, "index.html"));
  if (hasWebDist) {
    await app.register(staticPlugin, { root: webDist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (
        req.raw.url?.startsWith("/api") ||
        req.raw.url?.startsWith("/2.0") ||
        req.raw.url?.startsWith("/legacy")
      ) {
        return reply.code(404).send({ error: "not_found" });
      }
      return reply.type("text/html").sendFile("index.html", webDist);
    });
  } else {
    app.log.warn(`No built web app found at ${webDist} — serving API only (run the Vite dev server for the UI).`);
  }

  await app.listen({ port: config.port, host: "0.0.0.0" });
  await startMusicBrainzWorker();
  app.log.info(`Adolar Scrobbler listening on :${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
