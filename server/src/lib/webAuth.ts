import jwt from "jsonwebtoken";
import { FastifyRequest } from "fastify";
import { config } from "../config.js";
import { prisma } from "../db.js";

export interface WebTokenPayload {
  userId: string;
}

export function signWebToken(userId: string): string {
  return jwt.sign({ userId } satisfies WebTokenPayload, config.jwtSecret, { expiresIn: "30d" });
}

export async function getCurrentUser(req: FastifyRequest) {
  const token = req.cookies?.adolar_session;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret) as WebTokenPayload;
    return prisma.user.findUnique({ where: { id: payload.userId } });
  } catch {
    return null;
  }
}
