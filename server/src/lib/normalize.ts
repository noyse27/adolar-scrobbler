export function nameKey(name: string): string {
  return name.trim().toLowerCase().normalize("NFKC");
}

import { prisma } from "../db.js";

export async function findOrCreateArtist(name: string, mbid?: string) {
  const key = nameKey(name);
  const existing = await prisma.artist.findUnique({ where: { nameKey: key } });
  if (existing) return existing;
  return prisma.artist.create({ data: { name: name.trim(), nameKey: key, mbid } });
}

export async function findOrCreateAlbum(artistId: string, name: string, mbid?: string) {
  const key = nameKey(name);
  const existing = await prisma.album.findUnique({
    where: { artistId_nameKey: { artistId, nameKey: key } },
  });
  if (existing) return existing;
  return prisma.album.create({ data: { artistId, name: name.trim(), nameKey: key, mbid } });
}

export async function findOrCreateTrack(
  artistId: string,
  name: string,
  opts: { albumId?: string; mbid?: string; durationMs?: number; year?: number } = {}
) {
  const key = nameKey(name);
  const existing = await prisma.track.findUnique({
    where: { artistId_nameKey: { artistId, nameKey: key } },
  });
  if (existing) {
    // backfill album/duration if we learn more about a track we'd only seen bare before
    if ((opts.albumId && !existing.albumId) || (opts.durationMs && !existing.durationMs) ||
        (opts.year && !existing.year)) {
      return prisma.track.update({
        where: { id: existing.id },
        data: {
          albumId: existing.albumId ?? opts.albumId,
          durationMs: existing.durationMs ?? opts.durationMs,
          year: existing.year ?? opts.year,
        },
      });
    }
    return existing;
  }
  return prisma.track.create({
    data: {
      artistId,
      name: name.trim(),
      nameKey: key,
      albumId: opts.albumId,
      mbid: opts.mbid,
      durationMs: opts.durationMs,
      year: opts.year,
    },
  });
}

export async function resolveTrack(input: {
  artist: string;
  track: string;
  album?: string;
  mbid?: string;
  albumMbid?: string;
  artistMbid?: string;
  durationMs?: number;
  year?: number;
}) {
  const artist = await findOrCreateArtist(input.artist, input.artistMbid);
  let albumId: string | undefined;
  if (input.album && input.album.trim()) {
    const album = await findOrCreateAlbum(artist.id, input.album, input.albumMbid);
    albumId = album.id;
  }
  const track = await findOrCreateTrack(artist.id, input.track, {
    albumId,
    mbid: input.mbid,
    durationMs: input.durationMs,
    year: input.year,
  });
  return track;
}
