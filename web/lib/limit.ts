// Per-minute limits. shortcut: counted per server instance, so they slow abuse rather than stop it; move to Supabase or Redis if it matters.
const hits = new Map<string, { count: number; start: number }>();

export function underLimit(key: string, perMinute: number): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now - entry.start > 60_000) {
    if (hits.size > 5000) hits.clear();
    hits.set(key, { count: 1, start: now });
    return true;
  }
  return ++entry.count <= perMinute;
}

export const clientIp = (request: Request) => request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
