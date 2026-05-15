import { type NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const url = new URL(req.url);
  const explicitRunId = url.searchParams.get("run_id");

  let runId = explicitRunId;
  if (!runId) {
    const { data: latest } = await supabase
      .from("cluster_runs")
      .select("id")
      .order("calculated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    runId = latest?.id ?? null;
  }
  if (!runId) {
    return NextResponse.json({
      run: null,
      assignments: [],
      summaries: [],
      insights: [],
    });
  }

  const [runRes, assignRes, sumRes, insRes] = await Promise.all([
    supabase.from("cluster_runs").select("*").eq("id", runId).single(),
    supabase
      .from("cluster_assignments")
      .select("session_id, cluster_id, pc1, pc2")
      .eq("cluster_run_id", runId),
    supabase
      .from("cluster_summaries")
      .select(
        "cluster_id, question_id, summary, diversity_score, n_texts, mean_in, mean_out, diff, representativeness",
      )
      .eq("cluster_run_id", runId),
    supabase
      .from("cluster_insights")
      .select("question_id, insight_text, dominant_axis, disagreement_std")
      .eq("cluster_run_id", runId),
  ]);

  if (runRes.error) {
    return NextResponse.json({ error: runRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    run: runRes.data,
    assignments: assignRes.data ?? [],
    summaries: sumRes.data ?? [],
    insights: insRes.data ?? [],
  });
}
