import { connection } from "next/server";
import { radar } from "@/lib/store";

// Public on purpose: only totals and attack names, never a sender or any mail text.
export async function GET() {
  await connection(); // live totals: Next would otherwise build this once and freeze it
  try {
    return Response.json(await radar());
  } catch (e) {
    console.error("radar failed:", e);
    return Response.json({ error: "The radar isn't available right now" }, { status: 503 });
  }
}
