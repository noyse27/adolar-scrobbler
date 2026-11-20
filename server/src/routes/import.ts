import { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { getCurrentUser } from "../lib/webAuth.js";
import { runImportJob } from "../lib/importWorker.js";

export default async function importRoutes(app: FastifyInstance) {
  app.post<{ Body: { lastfmUsername: string } }>("/api/me/import", async (req, reply) => {
    const user = await getCurrentUser(req);
    if (!user) return reply.code(401).send({ error: "unauthenticated" });

    const lastfmUsername = req.body?.lastfmUsername?.trim();
    if (!lastfmUsername) return reply.code(400).send({ error: "missing_username" });

    const running = await prisma.importJob.findFirst({
      where: { userId: user.id, status: { in: ["PENDING", "RUNNING"] } },
    });
    if (running) return reply.code(409).send({ error: "import_already_running", job: running });

    const job = await prisma.importJob.create({ data: { userId: user.id, lastfmUsername } });
    // fire and forget; progress is polled via GET /api/me/import/:id
    void runImportJob(job.id);
    return job;
  });

  app.get("/api/me/import", async (req, reply) => {
    const user = await getCurrentUser(req);
    if (!user) return reply.code(401).send({ error: "unauthenticated" });
    return prisma.importJob.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
  });

  app.get<{ Params: { id: string } }>("/api/me/import/:id", async (req, reply) => {
    const user = await getCurrentUser(req);
    if (!user) return reply.code(401).send({ error: "unauthenticated" });
    const job = await prisma.importJob.findUnique({ where: { id: req.params.id } });
    if (!job || job.userId !== user.id) return reply.code(404).send({ error: "not_found" });
    return job;
  });
}
