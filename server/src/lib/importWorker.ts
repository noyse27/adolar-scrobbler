import { prisma, getInstanceSetting } from "../db.js";
import { resolveTrack } from "./normalize.js";

const LASTFM_API = "https://ws.audioscrobbler.com/2.0/";
const PAGE_SIZE = 200;
const DELAY_MS = 250; // be gentle with last.fm's API

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface LastfmTrackEntry {
  name: string;
  artist: { "#text": string };
  album?: { "#text": string };
  date?: { uts: string };
  "@attr"?: { nowplaying?: string };
}

export async function runImportJob(jobId: string) {
  const job = await prisma.importJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  const apiKey = await getInstanceSetting("lastfm_api_key");
  if (!apiKey) {
    await prisma.importJob.update({
      where: { id: jobId },
      data: { status: "FAILED", error: "No last.fm API key configured for this instance." },
    });
    return;
  }

  await prisma.importJob.update({ where: { id: jobId }, data: { status: "RUNNING" } });

  try {
    let page = 1;
    let totalPages = 1;
    let imported = 0;
    let skipped = 0;

    do {
      const url = new URL(LASTFM_API);
      url.searchParams.set("method", "user.getrecenttracks");
      url.searchParams.set("user", job.lastfmUsername);
      url.searchParams.set("api_key", apiKey);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("page", String(page));

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`last.fm API returned HTTP ${res.status}`);
      }
      const data = (await res.json()) as any;
      if (data.error) {
        throw new Error(`last.fm API error ${data.error}: ${data.message}`);
      }

      totalPages = Number(data.recenttracks?.["@attr"]?.totalPages ?? 1);
      const tracks: LastfmTrackEntry[] = Array.isArray(data.recenttracks?.track)
        ? data.recenttracks.track
        : data.recenttracks?.track
        ? [data.recenttracks.track]
        : [];

      for (const t of tracks) {
        if (t["@attr"]?.nowplaying === "true" || !t.date?.uts) {
          skipped++;
          continue;
        }
        const track = await resolveTrack({
          artist: t.artist["#text"],
          track: t.name,
          album: t.album?.["#text"],
        });
        const playedAt = new Date(Number(t.date.uts) * 1000);
        const result = await prisma.scrobble
          .create({
            data: { userId: job.userId, trackId: track.id, playedAt, source: "import" },
          })
          .catch(() => null);
        if (result) imported++;
        else skipped++;
      }

      await prisma.importJob.update({
        where: { id: jobId },
        data: { processedPages: page, totalPages, importedCount: imported, skippedCount: skipped },
      });

      page++;
      if (page <= totalPages) await sleep(DELAY_MS);
    } while (page <= totalPages);

    await prisma.importJob.update({ where: { id: jobId }, data: { status: "DONE" } });
  } catch (err: any) {
    await prisma.importJob.update({
      where: { id: jobId },
      data: { status: "FAILED", error: err?.message ?? "Unknown error" },
    });
  }
}
