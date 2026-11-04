import { checkRules } from "@/lib/engine";
import type { CheckRequest } from "@/lib/types";

const MAX_TEXT = 20_000;
const MAX_LINKS = 20;

// shortcut: rules only (mode "limited"). Add the LLM, web search and form fetch here once the keys are in .env.local.
export async function POST(request: Request) {
  let body: CheckRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const { text, sender = "", links = [] } = body ?? {};
  if (typeof text !== "string" || !text.trim()) return Response.json({ error: "text is required" }, { status: 400 });
  if (text.length > MAX_TEXT) return Response.json({ error: `text is over ${MAX_TEXT} characters` }, { status: 413 });
  if (typeof sender !== "string" || sender.length > 320) return Response.json({ error: "sender must be an email address" }, { status: 400 });
  if (!Array.isArray(links) || links.length > MAX_LINKS || links.some((l) => typeof l !== "string" || l.length > 2000))
    return Response.json({ error: `links must be up to ${MAX_LINKS} strings` }, { status: 400 });

  return Response.json(checkRules(text, sender, links));
}
