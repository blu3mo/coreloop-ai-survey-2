import { type NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin-auth";
import { recomputeClusters } from "@/lib/cluster-pipeline";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await recomputeClusters();
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("recompute failed:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
