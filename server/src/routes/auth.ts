import { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { hashPassword, md5, verifyPassword } from "../lib/crypto.js";
import { signWebToken, getCurrentUser } from "../lib/webAuth.js";
import { config } from "../config.js";

const USERNAME_RE = /^[a-zA-Z0-9_-]{2,32}$/;

export default async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { username: string; password: string; displayName?: string } }>(
    "/api/auth/register",
    async (req, reply) => {
      if (!config.allowRegistration) {
        return reply.code(403).send({ error: "registration_disabled" });
      }
      const { username, password, displayName } = req.body ?? ({} as any);
      if (!username || !USERNAME_RE.test(username)) {
        return reply.code(400).send({ error: "invalid_username" });
      }
      if (!password || password.length < 8) {
        return reply.code(400).send({ error: "password_too_short" });
      }
      const existing = await prisma.user.findUnique({ where: { username } });
      if (existing) return reply.code(409).send({ error: "username_taken" });

      const userCount = await prisma.user.count();
      const user = await prisma.user.create({
        data: {
          username,
          displayName: displayName?.trim() || username,
          passwordHash: await hashPassword(password),
          legacyPasswordMd5: md5(password),
          role: userCount === 0 ? "ADMIN" : "USER",
        },
      });

      const token = signWebToken(user.id);
      reply.setCookie("adolar_session", token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
      return { id: user.id, username: user.username, role: user.role };
    }
  );

  app.post<{ Body: { username: string; password: string } }>(
    "/api/auth/login",
    async (req, reply) => {
      const { username, password } = req.body ?? ({} as any);
      const user = await prisma.user.findUnique({ where: { username } });
      if (!user || !(await verifyPassword(user.passwordHash, password ?? ""))) {
        return reply.code(401).send({ error: "invalid_credentials" });
      }
      const token = signWebToken(user.id);
      reply.setCookie("adolar_session", token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
      return { id: user.id, username: user.username, role: user.role };
    }
  );

  app.post("/api/auth/logout", async (req, reply) => {
    reply.clearCookie("adolar_session", { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (req, reply) => {
    const user = await getCurrentUser(req);
    if (!user) return reply.code(401).send({ error: "unauthenticated" });
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      sessionKey: user.sessionKey,
      createdAt: user.createdAt,
    };
  });

  app.get("/api/auth/registration-open", async () => ({
    open: config.allowRegistration,
  }));

  // Approves a pending auth.getToken token from the web UI, completing the
  // last.fm-style "open this URL in a browser to authorize" handshake that
  // desktop/mobile scrobbler clients use.
  app.post<{ Body: { token: string } }>("/api/auth/authorize-token", async (req, reply) => {
    const user = await getCurrentUser(req);
    if (!user) return reply.code(401).send({ error: "unauthenticated" });
    const { token } = req.body ?? ({} as any);
    const row = await prisma.authToken.findUnique({ where: { token } });
    if (!row || row.expiresAt < new Date()) {
      return reply.code(404).send({ error: "token_not_found_or_expired" });
    }
    await prisma.authToken.update({
      where: { token },
      data: { authorized: true, userId: user.id },
    });
    return { ok: true };
  });
}
