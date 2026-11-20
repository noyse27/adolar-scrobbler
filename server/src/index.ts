import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import staticPlugin from "@fastify/static";
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cookie, { secret: config.cookieSecret });
  await app.register(cors, { origin: true, credentials: true });
  await app.register(formbody);

  await app.register(authRoutes);
  await app.register(lastfm2Routes);
  await app.register(legacyRoutes);
  await app.register(statsRoutes);
  await app.register(importRoutes);
  await app.register(adminRoutes);

  app.get("/healthz", async () => ({ ok: true }));

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
  app.log.info(`Adolar Scrobbler listening on :${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
