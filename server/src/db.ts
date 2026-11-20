import { PrismaClient } from "@prisma/client";
import { nanoid } from "nanoid";

export const prisma = new PrismaClient();

/**
 * The instance-wide api_key/secret pair used to validate api_sig on the
 * last.fm-compatible 2.0 Web Service. Generated once on first boot and
 * reused forever after, like a real last.fm API application registration.
 */
export async function getOrCreateAppCredentials(): Promise<{ apiKey: string; secret: string }> {
  const [apiKeyRow, secretRow] = await Promise.all([
    prisma.instanceSetting.findUnique({ where: { key: "app_api_key" } }),
    prisma.instanceSetting.findUnique({ where: { key: "app_secret" } }),
  ]);
  if (apiKeyRow && secretRow) return { apiKey: apiKeyRow.value, secret: secretRow.value };

  const apiKey = apiKeyRow?.value ?? nanoid(32);
  const secret = secretRow?.value ?? nanoid(32);
  await prisma.$transaction([
    prisma.instanceSetting.upsert({
      where: { key: "app_api_key" },
      update: {},
      create: { key: "app_api_key", value: apiKey },
    }),
    prisma.instanceSetting.upsert({
      where: { key: "app_secret" },
      update: {},
      create: { key: "app_secret", value: secret },
    }),
  ]);
  return { apiKey, secret };
}

export async function getInstanceSetting(key: string): Promise<string | null> {
  const row = await prisma.instanceSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function setInstanceSetting(key: string, value: string): Promise<void> {
  await prisma.instanceSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}
