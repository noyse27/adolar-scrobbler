import "dotenv/config";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET", "dev-insecure-secret-change-me"),
  cookieSecret: required("COOKIE_SECRET", "dev-insecure-cookie-secret"),
  publicUrl: process.env.PUBLIC_URL ?? "http://localhost:4000",
  // relative to server/src (dev) or server/dist (build) — both are one level under server/
  webDistPath: process.env.WEB_DIST_PATH ?? "../../web/dist",
  allowRegistration: (process.env.ALLOW_REGISTRATION ?? "true") === "true",
};
