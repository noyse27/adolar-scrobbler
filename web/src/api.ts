const BASE = "";

async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? "request_failed");
  }
  return res.json();
}

export interface Me {
  id: string;
  username: string;
  displayName: string | null;
  role: "ADMIN" | "USER";
  sessionKey: string;
  createdAt: string;
}

export const api = {
  me: () => request<Me>("/api/auth/me"),
  login: (username: string, password: string) =>
    request("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  register: (opts: {
    username: string;
    password: string;
    displayName?: string;
    setupToken?: string;
    inviteToken?: string;
  }) => request("/api/auth/register", { method: "POST", body: JSON.stringify(opts) }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  registrationOpen: () =>
    request<{ bootstrap: boolean; requiresSetupToken: boolean; open: boolean }>(
      "/api/auth/registration-open"
    ),

  overview: (username: string, range: string) =>
    request(`/api/users/${username}/overview?range=${range}`),
  topArtists: (username: string, range: string, limit = 10) =>
    request(`/api/users/${username}/charts/artists?range=${range}&limit=${limit}`),
  topAlbums: (username: string, range: string, limit = 10) =>
    request(`/api/users/${username}/charts/albums?range=${range}&limit=${limit}`),
  topTracks: (username: string, range: string, limit = 10) =>
    request(`/api/users/${username}/charts/tracks?range=${range}&limit=${limit}`),
  recent: (username: string, limit = 25) => request(`/api/users/${username}/recent?limit=${limit}`),
  loves: (username: string) => request(`/api/users/${username}/loves`),
  heatmap: (username: string, year: number) => request(`/api/users/${username}/heatmap?year=${year}`),
  clock: (username: string) => request(`/api/users/${username}/clock`),
  wild: (username: string) => request(`/api/users/${username}/wild`),
  leaderboard: () => request("/api/leaderboard"),

  love: (artist: string, track: string) =>
    request("/api/me/love", { method: "POST", body: JSON.stringify({ artist, track }) }),
  unlove: (trackId: string) =>
    request("/api/me/unlove", { method: "POST", body: JSON.stringify({ trackId }) }),

  startImport: (lastfmUsername: string) =>
    request("/api/me/import", { method: "POST", body: JSON.stringify({ lastfmUsername }) }),
  importJobs: () => request("/api/me/import"),
  importJob: (id: string) => request(`/api/me/import/${id}`),

  adminSettings: () => request("/api/admin/settings"),
  setLastfmKey: (lastfmApiKey: string) =>
    request("/api/admin/settings/lastfm-key", {
      method: "POST",
      body: JSON.stringify({ lastfmApiKey }),
    }),
  setAllowRegistration: (allow: boolean) =>
    request("/api/admin/settings/registration", { method: "POST", body: JSON.stringify({ allow }) }),

  invites: () => request("/api/admin/invites"),
  createInvite: (opts: { expiresInHours?: number; maxUses?: number }) =>
    request("/api/admin/invites", { method: "POST", body: JSON.stringify(opts) }),
  revokeInvite: (id: string) => request(`/api/admin/invites/${id}/revoke`, { method: "POST" }),
};
