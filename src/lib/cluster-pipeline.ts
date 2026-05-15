// ============================================================
// クラスタリング・要約パイプラインのオーケストレーション
// Issue #26: recompute (PCA + kmeans + 永続化)
// Issue #27: build-reasons (embedding + 要約 + insight + 軸ラベル)
// ============================================================

import {
  generateAxisLabels,
  generateQuestionInsight,
} from "./cluster-insights";
import {
  type ClusterQuestionGroup,
  summarizeAllGroups,
} from "./cluster-summarization";
import {
  type AnswerInput,
  buildResponseMatrix,
  computeQuestionAxes,
  computeRepresentativeness,
  runKMeansWithBestK,
  runPCA,
} from "./clustering";
import { ensureEmbeddings } from "./embeddings";
import { createAdminClient } from "./supabase";
import { SURVEY_QUESTIONS } from "./survey-data";

interface AnswerRow {
  id: string;
  session_id: string;
  question_id: string;
  question_text: string | null;
  likert: string | null;
  freetext: string | null;
  is_followup: boolean | null;
}

async function fetchAllBaseAnswers(): Promise<AnswerRow[]> {
  const supabase = createAdminClient();
  const PAGE_SIZE = 1000;
  const out: AnswerRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("answers")
      .select(
        "id, session_id, question_id, question_text, likert, freetext, is_followup",
      )
      .eq("is_followup", false)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`answers fetch error: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...(data as AnswerRow[]));
    if (data.length < PAGE_SIZE) break;
  }
  return out;
}

function buildQuestionTexts(answers: AnswerRow[]): Record<string, string> {
  // survey-data.ts を一次ソースとし、補完として answers 側の question_text を使う
  const out: Record<string, string> = {};
  for (const q of SURVEY_QUESTIONS) out[q.id] = q.text;
  const fallback = new Map<string, Map<string, number>>();
  for (const a of answers) {
    if (!a.question_text) continue;
    if (out[a.question_id]) continue;
    if (!fallback.has(a.question_id)) fallback.set(a.question_id, new Map());
    const m = fallback.get(a.question_id);
    if (!m) continue;
    m.set(a.question_text, (m.get(a.question_text) ?? 0) + 1);
  }
  for (const [qid, counts] of fallback.entries()) {
    let best = "";
    let bestN = -1;
    for (const [t, n] of counts)
      if (n > bestN) {
        best = t;
        bestN = n;
      }
    if (best) out[qid] = best;
  }
  return out;
}

export interface RecomputeResult {
  cluster_run_id: string;
  n_respondents: number;
  n_questions: number;
  k_chosen: number;
  silhouette_score: number;
}

/**
 * Recompute: 全回答からPCA→kmeans→代表設問抽出→DB永続化
 */
export async function recomputeClusters(): Promise<RecomputeResult> {
  const supabase = createAdminClient();
  const answers = await fetchAllBaseAnswers();

  const matrix = buildResponseMatrix(answers as AnswerInput[], {
    minAnsweredPerSession: 1,
  });

  if (matrix.sessionIds.length < 4) {
    throw new Error(
      `分析対象の回答者数が不足しています (${matrix.sessionIds.length}名). 4名以上必要です.`,
    );
  }

  const pca = runPCA(matrix);
  const km = runKMeansWithBestK(pca.coords, {
    kRange: [2, 3, 4, 5, 6].filter((k) => k <= matrix.sessionIds.length),
  });
  const repr = computeRepresentativeness(matrix, km.labels);
  const axes = computeQuestionAxes(matrix, pca, km.labels);

  // cluster_runs 挿入
  const { data: runRow, error: runErr } = await supabase
    .from("cluster_runs")
    .insert({
      n_respondents: matrix.sessionIds.length,
      n_questions: matrix.questionIds.length,
      k_chosen: km.bestK,
      silhouette_score: km.silhouette,
      pca_explained_variance: pca.explainedVariance,
      pca_loadings: pca.loadingsByQuestion,
      silhouette_by_k: km.silhouetteByK,
      question_ids: matrix.questionIds,
      params: {
        center: true,
        scale: false,
        kmeans_n_init: 10,
        k_range: [2, 6],
      },
    })
    .select("id")
    .single();
  if (runErr || !runRow) {
    throw new Error(`cluster_runs insert failed: ${runErr?.message}`);
  }
  const runId = runRow.id;

  // assignments
  const assignments = matrix.sessionIds.map((sid, i) => ({
    cluster_run_id: runId,
    session_id: sid,
    cluster_id: km.labels[i],
    pc1: pca.coords[i][0],
    pc2: pca.coords[i][1],
  }));
  const { error: aErr } = await supabase
    .from("cluster_assignments")
    .insert(assignments);
  if (aErr)
    throw new Error(`cluster_assignments insert failed: ${aErr.message}`);

  // summaries (まずは数値だけ。要約・diversityは build-reasons で埋める)
  const summaries = repr.map((r) => ({
    cluster_run_id: runId,
    cluster_id: r.cluster_id,
    question_id: r.question_id,
    summary: "",
    diversity_score: null,
    n_texts: 0,
    mean_in: r.mean_in,
    mean_out: r.mean_out,
    diff: r.diff,
    representativeness: r.representativeness,
  }));
  const { error: sErr } = await supabase
    .from("cluster_summaries")
    .insert(summaries);
  if (sErr) throw new Error(`cluster_summaries insert failed: ${sErr.message}`);

  // axes/insights (insight_text は空で初期化、build-reasons で埋める)
  const insightsInit = axes.map((a) => ({
    cluster_run_id: runId,
    question_id: a.question_id,
    insight_text: "",
    dominant_axis: a.dominant_axis,
    disagreement_std: a.disagreement_std,
  }));
  const { error: iErr } = await supabase
    .from("cluster_insights")
    .insert(insightsInit);
  if (iErr) throw new Error(`cluster_insights insert failed: ${iErr.message}`);

  return {
    cluster_run_id: runId,
    n_respondents: matrix.sessionIds.length,
    n_questions: matrix.questionIds.length,
    k_chosen: km.bestK,
    silhouette_score: km.silhouette,
  };
}

export interface BuildReasonsResult {
  cluster_run_id: string;
  n_embeddings: number;
  n_summaries: number;
  n_insights: number;
}

/**
 * Build reasons: 最新 cluster_run に対して
 * 1) freetext を embedding化
 * 2) (cluster, question)単位の要約 + 多様性スコア
 * 3) 質問ごとの insight + 軸ラベル
 */
export async function buildReasons(
  runId: string | null = null,
): Promise<BuildReasonsResult> {
  const supabase = createAdminClient();

  // 対象 cluster_run を確定
  let targetRunId = runId;
  if (!targetRunId) {
    const { data: latest } = await supabase
      .from("cluster_runs")
      .select("id")
      .order("calculated_at", { ascending: false })
      .limit(1)
      .single();
    if (!latest)
      throw new Error(
        "cluster_run が存在しません. 先に recompute を実行してください.",
      );
    targetRunId = latest.id;
  }

  // 割り当てと回答取得
  const { data: assignments } = await supabase
    .from("cluster_assignments")
    .select("session_id, cluster_id")
    .eq("cluster_run_id", targetRunId);
  if (!assignments || assignments.length === 0) {
    throw new Error("cluster_assignments が見つかりません.");
  }
  const sessionToCluster = new Map<string, number>();
  for (const a of assignments) sessionToCluster.set(a.session_id, a.cluster_id);

  const sessionIds = assignments.map((a) => a.session_id);
  const answers: AnswerRow[] = [];
  const PAGE_SIZE = 1000;
  for (let from = 0; from < sessionIds.length; from += PAGE_SIZE) {
    const slice = sessionIds.slice(from, from + PAGE_SIZE);
    const { data, error } = await supabase
      .from("answers")
      .select(
        "id, session_id, question_id, question_text, likert, freetext, is_followup",
      )
      .eq("is_followup", false)
      .in("session_id", slice);
    if (error) throw new Error(`answers fetch error: ${error.message}`);
    if (data) answers.push(...(data as AnswerRow[]));
  }

  // 自由記述を embedding化
  const freetextAnswers = answers
    .filter((a) => a.freetext && a.freetext.trim().length > 0)
    .map((a) => ({
      answer_id: a.id,
      session_id: a.session_id,
      question_id: a.question_id,
      text: (a.freetext ?? "").trim(),
    }));
  const embByAnswer = await ensureEmbeddings(freetextAnswers);

  // (cluster_id, question_id) でグループ化
  const questionTexts = buildQuestionTexts(answers);
  const groupMap = new Map<string, ClusterQuestionGroup>();
  for (const a of answers) {
    const text = (a.freetext ?? "").trim();
    if (!text) continue;
    const cluster = sessionToCluster.get(a.session_id);
    if (cluster === undefined) continue;
    const key = `${cluster}::${a.question_id}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        cluster_id: cluster,
        question_id: a.question_id,
        question_text: questionTexts[a.question_id] ?? a.question_text ?? "",
        texts: [],
      });
    }
    const emb = embByAnswer.get(a.id);
    if (!emb) continue;
    groupMap.get(key)?.texts.push({ answer_id: a.id, text, embedding: emb });
  }
  const groups = [...groupMap.values()];

  // 要約 + 多様性スコア
  const summaries = await summarizeAllGroups(groups);

  // DB更新: cluster_summaries の summary/diversity/n_texts を埋める
  for (const s of summaries) {
    await supabase
      .from("cluster_summaries")
      .update({
        summary: s.summary,
        diversity_score: s.diversity_score,
        n_texts: s.n_texts,
      })
      .eq("cluster_run_id", targetRunId)
      .eq("cluster_id", s.cluster_id)
      .eq("question_id", s.question_id);
  }

  // Likertの実分布をクラスタ×設問単位で集計（imputed値ではなく生回答）
  const clusterSizes = new Map<number, number>();
  for (const cid of sessionToCluster.values()) {
    clusterSizes.set(cid, (clusterSizes.get(cid) ?? 0) + 1);
  }
  type LikertStat = {
    cluster_id: number;
    question_id: string;
    n_strongly_agree: number;
    n_agree: number;
    n_neutral: number;
    n_disagree: number;
    n_strongly_disagree: number;
    n_dont_know: number;
  };
  const statKey = (c: number, q: string) => `${c}::${q}`;
  const stats = new Map<string, LikertStat>();
  for (const a of answers) {
    const cluster = sessionToCluster.get(a.session_id);
    if (cluster === undefined) continue;
    if (!a.likert) continue;
    const key = statKey(cluster, a.question_id);
    if (!stats.has(key)) {
      stats.set(key, {
        cluster_id: cluster,
        question_id: a.question_id,
        n_strongly_agree: 0,
        n_agree: 0,
        n_neutral: 0,
        n_disagree: 0,
        n_strongly_disagree: 0,
        n_dont_know: 0,
      });
    }
    const s = stats.get(key);
    if (!s) continue;
    if (a.likert === "strongly_agree") s.n_strongly_agree++;
    else if (a.likert === "agree") s.n_agree++;
    else if (a.likert === "neutral") s.n_neutral++;
    else if (a.likert === "disagree") s.n_disagree++;
    else if (a.likert === "strongly_disagree") s.n_strongly_disagree++;
    else if (a.likert === "dont_know") s.n_dont_know++;
  }

  function buildClusterData(qid: string, cid: number) {
    const s = stats.get(statKey(cid, qid));
    const total = clusterSizes.get(cid) ?? 0;
    const n_answered = s
      ? s.n_strongly_agree +
        s.n_agree +
        s.n_neutral +
        s.n_disagree +
        s.n_strongly_disagree +
        s.n_dont_know
      : 0;
    const n_valid = s
      ? s.n_strongly_agree +
        s.n_agree +
        s.n_neutral +
        s.n_disagree +
        s.n_strongly_disagree
      : 0;
    const mean_likert =
      n_valid === 0
        ? Number.NaN
        : (2 * (s?.n_strongly_agree ?? 0) +
            1 * (s?.n_agree ?? 0) +
            0 * (s?.n_neutral ?? 0) -
            1 * (s?.n_disagree ?? 0) -
            2 * (s?.n_strongly_disagree ?? 0)) /
          n_valid;
    const agree_rate =
      n_answered === 0
        ? 0
        : ((s?.n_strongly_agree ?? 0) + (s?.n_agree ?? 0)) / n_answered;
    const disagree_rate =
      n_answered === 0
        ? 0
        : ((s?.n_strongly_disagree ?? 0) + (s?.n_disagree ?? 0)) / n_answered;
    const dont_know_rate =
      n_answered === 0 ? 0 : (s?.n_dont_know ?? 0) / n_answered;
    const summary = summaries.find(
      (x) => x.cluster_id === cid && x.question_id === qid,
    );
    return {
      cluster_id: cid,
      n_respondents: total,
      mean_likert,
      agree_rate,
      disagree_rate,
      dont_know_rate,
      n_freetexts: summary?.n_texts ?? 0,
      diversity_score: summary?.diversity_score ?? null,
      summary: summary?.summary ?? "",
    };
  }

  // 全クラスタIDと全質問IDを収集（自由記述の有無に関わらず全問題で insight 生成）
  const allClusterIds = [...clusterSizes.keys()].sort((a, b) => a - b);
  const { data: runRowForQids } = await supabase
    .from("cluster_runs")
    .select("question_ids")
    .eq("id", targetRunId)
    .single();
  const allQuestionIds = (runRowForQids?.question_ids as string[] | null) ?? [];

  // dominant_axis を質問ごとに取得
  const { data: insightRows } = await supabase
    .from("cluster_insights")
    .select("question_id, dominant_axis")
    .eq("cluster_run_id", targetRunId);
  const axisByQuestion = new Map<string, "pc1" | "pc2">();
  for (const r of insightRows ?? []) {
    if (r.dominant_axis === "pc1" || r.dominant_axis === "pc2") {
      axisByQuestion.set(r.question_id, r.dominant_axis);
    }
  }

  let insightCount = 0;
  const insightTasks = allQuestionIds.map(async (qid) => {
    const clusterData = allClusterIds.map((cid) => buildClusterData(qid, cid));
    const insight = await generateQuestionInsight({
      question_id: qid,
      question_text: questionTexts[qid] ?? "",
      dominant_axis: axisByQuestion.get(qid) ?? "pc1",
      cluster_data: clusterData,
    });
    await supabase
      .from("cluster_insights")
      .update({ insight_text: insight })
      .eq("cluster_run_id", targetRunId)
      .eq("question_id", qid);
    insightCount++;
  });
  // 並列度制限
  const CHUNK = 3;
  for (let i = 0; i < insightTasks.length; i += CHUNK) {
    await Promise.all(insightTasks.slice(i, i + CHUNK));
  }

  // 軸ラベル生成 → cluster_runs.axis_labels に保存
  const { data: runRow } = await supabase
    .from("cluster_runs")
    .select("pca_loadings, question_ids")
    .eq("id", targetRunId)
    .single();
  if (runRow) {
    const loadings = runRow.pca_loadings as Record<
      string,
      { pc1: number; pc2: number }
    >;
    const axisLabels = await generateAxisLabels({
      loadingsByQuestion: loadings,
      questionTexts,
    });
    await supabase
      .from("cluster_runs")
      .update({
        axis_labels: JSON.parse(JSON.stringify(axisLabels)),
        reasons_built_at: new Date().toISOString(),
      })
      .eq("id", targetRunId);
  }

  return {
    cluster_run_id: targetRunId,
    n_embeddings: embByAnswer.size,
    n_summaries: summaries.length,
    n_insights: insightCount,
  };
}
