import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { config } from "../config.js";

const MB_BASE = "https://musicbrainz.org/ws/2";
const CAA_BASE = "https://coverartarchive.org";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 6;
let lastMusicBrainzRequestAt = 0;
let workerTimer: NodeJS.Timeout | null = null;
let workerBusy = false;

function normalizedName(name: string) {
  return name.trim().toLowerCase().normalize("NFKC");
}

interface MbArtistCredit {
  name: string;
  artist: { id: string; name: string; "sort-name"?: string; disambiguation?: string };
}

interface MbReleaseGroup {
  id: string;
  title: string;
  "primary-type"?: string;
  "secondary-types"?: string[];
  "first-release-date"?: string;
}

interface MbRelease {
  id: string;
  title: string;
  date?: string;
  "release-group"?: MbReleaseGroup;
}

interface MbRecording {
  id: string;
  title: string;
  score?: number;
  length?: number;
  disambiguation?: string;
  "artist-credit"?: MbArtistCredit[];
  releases?: MbRelease[];
}

interface CandidateSummary {
  id: string;
  title: string;
  score: number;
  artists: string[];
  releases: string[];
  disambiguation?: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function userAgent() {
  const contact = config.musicBrainzContact.trim();
  return `AdolarScrobbler/0.1.1${contact ? ` (${contact})` : ""}`;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<Buffer> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > maxBytes) throw new Error(`Response exceeds ${maxBytes} byte limit`);
  if (!response.body) throw new Error("Response has no body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("response too large");
        throw new Error(`Response exceeds ${maxBytes} byte limit`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function musicBrainzJson<T>(endpoint: string): Promise<T> {
  const wait = Math.max(0, 1_100 - (Date.now() - lastMusicBrainzRequestAt));
  if (wait) await sleep(wait);
  lastMusicBrainzRequestAt = Date.now();
  const response = await fetchWithTimeout(`${MB_BASE}${endpoint}`, {
    headers: { Accept: "application/json", "User-Agent": userAgent() },
  });
  if (!response.ok) throw new Error(`MusicBrainz HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

function lucene(value: string) {
  return `"${value.replace(/[\\"]/g, "\\$&")}"`;
}

function bestRelease(releases: MbRelease[] | undefined, albumName?: string | null) {
  if (!releases?.length) return undefined;
  if (albumName) {
    const exact = releases.find((release) => normalizedName(release.title) === normalizedName(albumName));
    if (exact) return exact;
  }
  return releases.find((release) => release["release-group"]?.["primary-type"] === "Album") ?? releases[0];
}

function recordingMatches(recording: MbRecording, trackName: string, artistName: string) {
  if ((recording.score ?? 0) < 90 || normalizedName(recording.title) !== normalizedName(trackName)) return false;
  return recording["artist-credit"]?.some((credit) =>
    normalizedName(credit.artist.name) === normalizedName(artistName) || normalizedName(credit.name) === normalizedName(artistName)
  ) ?? false;
}

function summarizeCandidates(recordings: MbRecording[] = []): CandidateSummary[] {
  const safe = (value: unknown, max = 300) => String(value ?? "").slice(0, max);
  return recordings.slice(0, 5).map((recording) => ({
    id: recording.id,
    title: safe(recording.title),
    score: recording.score ?? 0,
    artists: recording["artist-credit"]?.map((credit) => safe(credit.name)) ?? [],
    releases: [...new Set(recording.releases?.map((release) => safe(release.title)) ?? [])].slice(0, 3),
    disambiguation: recording.disambiguation ? safe(recording.disambiguation) : undefined,
  }));
}

async function findRecording(track: {
  name: string;
  mbid: string | null;
  durationMs: number | null;
  artist: { name: string };
  album: { name: string } | null;
}): Promise<{ recording: MbRecording | null; candidates: CandidateSummary[] }> {
  if (track.mbid && UUID.test(track.mbid)) {
    try {
      const recording = await musicBrainzJson<MbRecording>(
        `/recording/${track.mbid}?inc=artists+releases+release-groups&fmt=json`
      );
      return { recording, candidates: [] };
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("HTTP 404")) throw error;
    }
  }

  const baseTerms = [`recording:${lucene(track.name)}`, `artist:${lucene(track.artist.name)}`];
  const terms = [...baseTerms];
  if (track.album?.name) terms.push(`release:${lucene(track.album.name)}`);
  let result = await musicBrainzJson<{ recordings?: MbRecording[] }>(
    `/recording?query=${encodeURIComponent(terms.join(" AND "))}&limit=5&fmt=json`
  );
  if (!result.recordings?.length && track.album?.name) {
    result = await musicBrainzJson<{ recordings?: MbRecording[] }>(
      `/recording?query=${encodeURIComponent(baseTerms.join(" AND "))}&limit=5&fmt=json`
    );
  }
  const candidates = result.recordings ?? [];
  return {
    recording: candidates.find((candidate) => recordingMatches(candidate, track.name, track.artist.name)) ?? null,
    candidates: summarizeCandidates(candidates),
  };
}

async function enrichArtist(credit: MbArtistCredit | undefined, artistId: string) {
  if (!credit || !UUID.test(credit.artist.id)) return;
  const details = await musicBrainzJson<any>(`/artist/${credit.artist.id}?inc=genres&fmt=json`);
  const genres = Array.isArray(details.genres)
    ? details.genres
        .sort((a: any, b: any) => Number(b.count ?? 0) - Number(a.count ?? 0))
        .slice(0, 5)
        .map((genre: any) => String(genre.name))
    : [];
  await prisma.artist.update({
    where: { id: artistId },
    data: {
      mbid: details.id,
      sortName: details["sort-name"] ?? credit.artist["sort-name"],
      type: details.type,
      country: details.country,
      disambiguation: details.disambiguation || null,
      beginDate: details["life-span"]?.begin ?? null,
      endDate: details["life-span"]?.end ?? null,
      genres,
    },
  });
}

async function cacheCover(releaseGroupMbid: string, albumId: string) {
  const album = await prisma.album.findUnique({ where: { id: albumId } });
  if (!album || (album.coverCheckedAt && Date.now() - album.coverCheckedAt.getTime() < 30 * 86400000)) return;
  const filename = `${releaseGroupMbid}-250.jpg`;
  const target = path.resolve(config.coverCacheDir, filename);
  try {
    const response = await fetchWithTimeout(`${CAA_BASE}/release-group/${releaseGroupMbid}/front-250`, {
      headers: { "User-Agent": userAgent() },
      redirect: "follow",
    });
    if (response.status === 404) {
      await prisma.album.update({ where: { id: albumId }, data: { coverCheckedAt: new Date() } });
      return;
    }
    if (!response.ok) throw new Error(`Cover Art Archive HTTP ${response.status}`);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("image/")) throw new Error("Cover response is not an image");
    const bytes = await readLimitedBody(response, 2_000_000);
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
      throw new Error("Cover response is not a valid JPEG");
    }
    await fsp.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.tmp`;
    await fsp.writeFile(temporary, bytes);
    await fsp.rename(temporary, target);
    await prisma.album.update({
      where: { id: albumId },
      data: { coverPath: filename, coverCheckedAt: new Date() },
    });
  } catch (error) {
    if (fs.existsSync(target)) return;
    throw error;
  }
}

async function processTrack(trackId: string) {
  const track = await prisma.track.findUnique({
    where: { id: trackId },
    include: { artist: true, album: true },
  });
  if (!track) return { status: "DONE" as const, candidates: [] };
  const match = await findRecording(track);
  if (!match.recording) return { status: "NO_MATCH" as const, candidates: match.candidates };
  const recording = match.recording;

  const release = bestRelease(recording.releases, track.album?.name);
  const group = release?.["release-group"];
  await prisma.track.update({
    where: { id: track.id },
    data: {
      mbid: recording.id,
      durationMs: track.durationMs ?? recording.length ?? undefined,
      artistCredits: recording["artist-credit"]?.map((credit) => credit.name) ?? [],
      artistCreditMbids: recording["artist-credit"]?.map((credit) => credit.artist.id) ?? [],
    },
  });
  await enrichArtist(recording["artist-credit"]?.[0], track.artistId);

  if (track.albumId && release) {
    await prisma.album.update({
      where: { id: track.albumId },
      data: {
        mbid: release.id,
        releaseGroupMbid: group?.id,
        primaryType: group?.["primary-type"],
        secondaryTypes: group?.["secondary-types"] ?? [],
        firstReleaseDate: group?.["first-release-date"] ?? release.date,
      },
    });
    if (group?.id) await cacheCover(group.id, track.albumId);
  }
  return { status: "DONE" as const, candidates: [] };
}

export async function enqueueTrackEnrichment(trackId: string) {
  if (!config.musicBrainzEnabled) return;
  await prisma.enrichmentJob.upsert({
    where: { targetType_targetId: { targetType: "TRACK", targetId: trackId } },
    update: {},
    create: { targetType: "TRACK", targetId: trackId },
  });
}

async function enqueueExistingTracks() {
  await prisma.$executeRaw`
    INSERT INTO "EnrichmentJob" ("id", "targetType", "targetId", "status", "attempts", "nextAttemptAt", "createdAt", "updatedAt")
    SELECT CONCAT('mb-', t.id), 'TRACK', t.id, 'PENDING'::"EnrichmentStatus", 0, NOW(), NOW(), NOW()
    FROM "Track" t
    ON CONFLICT ("targetType", "targetId") DO NOTHING
  `;
}

async function runNextJob() {
  if (workerBusy) return;
  workerBusy = true;
  try {
    const candidate = await prisma.enrichmentJob.findFirst({
      where: { status: { in: ["PENDING", "RETRY"] }, nextAttemptAt: { lte: new Date() } },
      orderBy: { createdAt: "asc" },
    });
    if (!candidate) return;
    const claimed = await prisma.enrichmentJob.updateMany({
      where: { id: candidate.id, status: { in: ["PENDING", "RETRY"] } },
      data: { status: "RUNNING", attempts: { increment: 1 }, lastError: null },
    });
    if (claimed.count !== 1) return;
    try {
      const result = candidate.targetType === "TRACK"
        ? await processTrack(candidate.targetId)
        : { status: "FAILED" as const, candidates: [] };
      await prisma.enrichmentJob.update({
        where: { id: candidate.id },
        data: { status: result.status, candidates: result.candidates as unknown as Prisma.InputJsonValue },
      });
    } catch (error) {
      const attempts = candidate.attempts + 1;
      const retry = attempts < MAX_ATTEMPTS;
      const delayMinutes = Math.min(24 * 60, 2 ** attempts) + Math.random() * 2;
      await prisma.enrichmentJob.update({
        where: { id: candidate.id },
        data: {
          status: retry ? "RETRY" : "FAILED",
          nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000),
          lastError: error instanceof Error ? error.message.slice(0, 500) : "Unknown enrichment error",
        },
      });
    }
  } finally {
    workerBusy = false;
  }
}

export async function startMusicBrainzWorker() {
  if (!config.musicBrainzEnabled || workerTimer) return;
  await prisma.enrichmentJob.updateMany({ where: { status: "RUNNING" }, data: { status: "RETRY" } });
  await prisma.enrichmentJob.updateMany({
    where: {
      status: "NO_MATCH",
      updatedAt: { lt: new Date(Date.now() - 30 * 86400000) },
    },
    data: { status: "RETRY", nextAttemptAt: new Date() },
  });
  await enqueueExistingTracks();
  workerTimer = setInterval(() => void runNextJob(), 2_000);
  void runNextJob();
}

export function stopMusicBrainzWorker() {
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = null;
}
