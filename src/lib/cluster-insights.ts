// ============================================================
// 質問ごとのクラスタ横断インサイト & PC1/PC2 軸ラベル
// Issue #26/#27 (insight, axis labels はadminUI表示用)
// ============================================================

import { callOpenRouter } from "./openrouter";

export interface AxisLabelInput {
  loadingsByQuestion: Record<string, { pc1: number; pc2: number }>;
  questionTexts: Record<string, string>;
}

export interface AxisLabels {
  pc1: { positive: string; negative: string };
  pc2: { positive: string; negative: string };
}

export async function generateAxisLabels(
  input: AxisLabelInput,
): Promise<AxisLabels> {
  const qids = Object.keys(input.loadingsByQuestion);
  const lines: string[] = [];
  for (const qid of qids) {
    const { pc1, pc2 } = input.loadingsByQuestion[qid];
    const text = (input.questionTexts[qid] ?? "").slice(0, 80);
    lines.push(
      `- ${qid}: PC1負荷=${pc1.toFixed(3)}, PC2負荷=${pc2.toFixed(3)} / 設問: ${text}`,
    );
  }

  const prompt = `あなたは社会調査のクラスタリング結果を解釈する分析者です。以下はPCAの第1・第2主成分への各設問の負荷量です。各軸の両極（+方向と−方向）が何を意味するかを、各6〜14文字程度の短いラベルで日本語で命名してください。

${lines.join("\n")}

出力は次のJSON形式のみ。前後に説明文を付けないでください:
{
  "pc1": { "positive": "...", "negative": "..." },
  "pc2": { "positive": "...", "negative": "..." }
}`;

  const raw = await callOpenRouter([{ role: "user", content: prompt }], {
    maxTokens: 400,
    temperature: 0.2,
  });
  return parseAxisLabels(raw);
}

function parseAxisLabels(raw: string): AxisLabels {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const text = jsonMatch ? jsonMatch[0] : raw;
  try {
    const parsed = JSON.parse(text);
    return {
      pc1: {
        positive: String(parsed?.pc1?.positive ?? "").slice(0, 30),
        negative: String(parsed?.pc1?.negative ?? "").slice(0, 30),
      },
      pc2: {
        positive: String(parsed?.pc2?.positive ?? "").slice(0, 30),
        negative: String(parsed?.pc2?.negative ?? "").slice(0, 30),
      },
    };
  } catch {
    return {
      pc1: { positive: "", negative: "" },
      pc2: { positive: "", negative: "" },
    };
  }
}

export interface ClusterDataForInsight {
  cluster_id: number;
  n_respondents: number;
  /** dont_know を除いた平均値 (-2 .. +2) */
  mean_likert: number;
  /** agree + strongly_agree の比率 (0..1) */
  agree_rate: number;
  /** disagree + strongly_disagree の比率 (0..1) */
  disagree_rate: number;
  /** dont_know の比率 (0..1) */
  dont_know_rate: number;
  /** 自由記述を書いた人数 */
  n_freetexts: number;
  /** ペア間 cosine 距離の平均 (理由テキストの分散度) */
  diversity_score: number | null;
  /** 自由記述の100字要約 */
  summary: string;
}

export interface InsightInput {
  question_id: string;
  question_text: string;
  dominant_axis: "pc1" | "pc2";
  cluster_data: ClusterDataForInsight[];
}

function fmtPct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function fmtSigned(v: number): string {
  if (Number.isNaN(v)) return "—";
  return v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
}

export async function generateQuestionInsight(
  input: InsightInput,
): Promise<string> {
  const sorted = [...input.cluster_data].sort(
    (a, b) => a.cluster_id - b.cluster_id,
  );
  const lines = sorted.map((c) => {
    const diversity =
      c.diversity_score !== null && c.diversity_score !== undefined
        ? c.diversity_score.toFixed(3)
        : "—";
    const summary = c.summary?.trim() || "（自由記述なし）";
    return [
      `[Cluster ${c.cluster_id}] n=${c.n_respondents}`,
      `  ・回答: 平均 ${fmtSigned(c.mean_likert)} / 賛成 ${fmtPct(c.agree_rate)} / 反対 ${fmtPct(c.disagree_rate)} / わからない ${fmtPct(c.dont_know_rate)}`,
      `  ・自由記述: ${c.n_freetexts}件 / 多様性 ${diversity}`,
      `  ・要約: ${summary}`,
    ].join("\n");
  });

  const prompt = `あなたは熟議型世論調査の分析者です。次の設問に対する複数クラスタの回答状況と自由記述要約から、クラスタ横断の洞察を日本語300字程度で記述してください。

含めるべき観点:
- 賛否の構図: どのクラスタが賛成・反対・中立か (mean_likert と 賛成/反対率 を根拠に)
- 多様性: 同じ立場でも理由が収束しているか分散しているか (diversity を根拠に)
- 自由記述から読み取れる論理の特徴と、量的データだけでは見えない違い
- 「表面的合意」(立場は同じだが理由が分散) と「実質的合意」(立場も理由も収束) の区別

設問: ${input.question_text}
主要分析軸: ${input.dominant_axis.toUpperCase()}

クラスタ別データ:
${lines.join("\n")}

300字程度の日本語本文のみを出力（前置き・見出し・箇条書き不要）。`;

  try {
    return (
      await callOpenRouter([{ role: "user", content: prompt }], {
        maxTokens: 600,
        temperature: 0.3,
      })
    ).trim();
  } catch (e) {
    console.error("generateQuestionInsight failed:", e);
    return "";
  }
}
