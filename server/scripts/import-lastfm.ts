/*
 * CLI fallback for importing last.fm history, for when you'd rather not
 * go through the web UI (e.g. bulk-importing several accounts on first
 * setup). The web UI's "Import from last.fm" button does the same thing
 * via POST /api/me/import.
 *
 * Usage:
 *   npm run import:lastfm -- --user <local-username> --lastfm <lastfm-username> [--api-key <key>]
 */
import "dotenv/config";
import { prisma, setInstanceSetting } from "../src/db.js";
import { runImportJob } from "../src/lib/importWorker.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const localUsername = arg("user");
  const lastfmUsername = arg("lastfm");
  const apiKey = arg("api-key");

  if (!localUsername || !lastfmUsername) {
    console.error("Usage: --user <local-username> --lastfm <lastfm-username> [--api-key <key>]");
    process.exit(1);
  }

  if (apiKey) await setInstanceSetting("lastfm_api_key", apiKey);

  const user = await prisma.user.findUnique({ where: { username: localUsername } });
  if (!user) {
    console.error(`No local user "${localUsername}" found. Register them in the web UI first.`);
    process.exit(1);
  }

  const job = await prisma.importJob.create({ data: { userId: user.id, lastfmUsername } });
  console.log(`Starting import job ${job.id} for last.fm user "${lastfmUsername}"...`);
  await runImportJob(job.id);

  const final = await prisma.importJob.findUnique({ where: { id: job.id } });
  console.log(`Done. status=${final?.status} imported=${final?.importedCount} skipped=${final?.skippedCount} error=${final?.error ?? "-"}`);
  process.exit(final?.status === "DONE" ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
