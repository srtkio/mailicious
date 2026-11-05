import { createHash, timingSafeEqual } from "node:crypto";
import { dashboard, setVerdict } from "@/lib/store";

const digest = (s: string) => createHash("sha256").update(s).digest();

// shortcut: one shared password, not accounts. Fine for a placement-cell pilot; add sign-in before wider use.
function allowed(request: Request): boolean {
  const password = process.env.ADMIN_PASSWORD;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  return !!password && timingSafeEqual(digest(given), digest(password));
}

export async function GET(request: Request) {
  if (!allowed(request)) return Response.json({ error: "Wrong password" }, { status: 401 });
  try {
    return Response.json(await dashboard());
  } catch (e) {
    console.error("dashboard failed:", e);
    return Response.json({ error: "Campus data isn't available right now" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!allowed(request)) return Response.json({ error: "Wrong password" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (typeof body?.target !== "string" || body.target.length > 320 || !/^[\w.@+-]+$/.test(body.target) || !["fake", "genuine"].includes(body.verdict))
    return Response.json({ error: "A target and a verdict are required" }, { status: 400 });
  try {
    await setVerdict(body.target.toLowerCase(), body.verdict);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("verdict failed:", e);
    return Response.json({ error: "Couldn't save that" }, { status: 503 });
  }
}
