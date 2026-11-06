import { createHash, timingSafeEqual } from "node:crypto";
import { clientIp, underLimit } from "@/lib/limit";
import { dashboard, isSharedDomain, setVerdict } from "@/lib/store";

const digest = (s: string) => createHash("sha256").update(s).digest();

// shortcut: one shared password, not accounts. Fine for a placement-cell pilot; add sign-in before wider use.
function allowed(request: Request): boolean {
  const password = process.env.ADMIN_PASSWORD;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!!password && timingSafeEqual(digest(given), digest(password))) return true;
  console.warn("dashboard: wrong password");
  return false;
}

const refused = (request: Request) => !underLimit(`admin:${clientIp(request)}`, 30);

export async function GET(request: Request) {
  if (refused(request)) return Response.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  if (!allowed(request)) return Response.json({ error: "Wrong password" }, { status: 401 });
  try {
    return Response.json(await dashboard());
  } catch (e) {
    console.error("dashboard failed:", e);
    return Response.json({ error: "Campus data isn't available right now" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (refused(request)) return Response.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  if (!allowed(request)) return Response.json({ error: "Wrong password" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (typeof body?.target !== "string" || body.target.length > 320 || !/^[\w.@+-]+$/.test(body.target) || !["fake", "genuine"].includes(body.verdict))
    return Response.json({ error: "A target and a verdict are required" }, { status: 400 });
  // One verdict must never brand all of Gmail, or the whole college, as fake.
  if (!body.target.includes("@") && isSharedDomain(body.target)) return Response.json({ error: "That domain is shared by many people. Mark the full address instead." }, { status: 400 });
  try {
    await setVerdict(body.target.toLowerCase(), body.verdict);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("verdict failed:", e);
    return Response.json({ error: "Couldn't save that" }, { status: 503 });
  }
}
