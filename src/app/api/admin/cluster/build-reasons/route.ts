import { type NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin-auth";
import { buildReasons } from "@/lib/cluster-pipeline";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const runId = typeof body?.run_id === "string" ? body.run_id : null;
    const result = await buildReasons(runId);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("build-reasons failed:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
