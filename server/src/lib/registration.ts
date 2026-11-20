import { prisma, getInstanceSetting, setInstanceSetting } from "../db.js";
import { config } from "../config.js";
import { nanoid } from "nanoid";

const SETTING_KEY = "allow_registration";

export async function getAllowRegistration(): Promise<boolean> {
  const stored = await getInstanceSetting(SETTING_KEY);
  if (stored !== null) return stored === "true";
  return config.allowRegistrationDefault;
}

export async function setAllowRegistration(allow: boolean): Promise<void> {
  await setInstanceSetting(SETTING_KEY, String(allow));
}

export async function validateInvite(token: string) {
  const invite = await prisma.inviteCode.findUnique({ where: { token } });
  if (!invite) return null;
  if (invite.revoked) return null;
  if (invite.expiresAt && invite.expiresAt < new Date()) return null;
  if (invite.usedCount >= invite.maxUses) return null;
  return invite;
}

export async function consumeInvite(inviteId: string, userId: string): Promise<void> {
  await prisma.inviteCode.update({
    where: { id: inviteId },
    data: { usedCount: { increment: 1 } },
  });
  await prisma.user.update({ where: { id: userId }, data: { invitedByInviteId: inviteId } });
}

export async function createInvite(opts: {
  createdById: string;
  expiresInHours?: number;
  maxUses?: number;
}) {
  return prisma.inviteCode.create({
    data: {
      token: nanoid(20),
      createdById: opts.createdById,
      maxUses: opts.maxUses && opts.maxUses > 0 ? opts.maxUses : 1,
      expiresAt: opts.expiresInHours
        ? new Date(Date.now() + opts.expiresInHours * 60 * 60 * 1000)
        : undefined,
    },
  });
}
