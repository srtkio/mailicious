import { clientIp, underLimit } from "@/lib/limit";
import { addReport, reportTarget } from "@/lib/store";

const LEVELS = ["low", "medium", "high"];

// Reports only join the coordinator's queue. Nothing is blocked until a person marks it fake.
export async function POST(request: Request) {
  if (!underLimit(`report:${clientIp(request)}`, 10)) return Response.json({ error: "Too many reports. Try again in a minute." }, { status: 429 });
  const body = await request.json().catch(() => null);
  const target = typeof body?.sender === "string" ? reportTarget(body.sender) : null;
  if (!target) return Response.json({ error: "A valid sender address is required" }, { status: 400 });
  const level = LEVELS.includes(body.level) ? body.level : null;
  const attack = typeof body.attack === "string" ? body.attack.slice(0, 60) : null;
  try {
    await addReport(target, level, attack);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("report failed:", e);
    return Response.json({ error: "Reporting isn't available right now" }, { status: 503 });
  }
}
