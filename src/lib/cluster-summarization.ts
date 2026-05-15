// ============================================================
// クラスタ × 設問ごとの理由テキスト要約 + 多様性スコア
// Issue #27
// ============================================================

import { meanPairwiseCosineDistance } from "./embeddings";
import { callOpenRouter } from "./openrouter";

export interface ClusterQuestionGroup {
  cluster_id: number;
  question_id: string;
  question_text: string;
  texts: { answer_id: string; text: string; embedding: number[] }[];
}

export interface ClusterQuestionSummary {
  cluster_id: number;
  question_id: string;
  summary: string;
  diversity_score: number | null;
  n_texts: number;
}

export async function summarizeClusterQuestion(
  group: ClusterQuestionGroup,
): Promise<ClusterQuestionSummary> {
  const n = group.texts.length;
  if (n === 0) {
    return {
      cluster_id: group.cluster_id,
      question_id: group.question_id,
      summary: "",
      diversity_score: null,
      n_texts: 0,
    };
  }

  const diversity = meanPairwiseCosineDistance(
    group.texts.map((t) => t.embedding),
  );

  const textBlock = group.texts.map((t) => `- ${t.text}`).join("\n");
  const prompt = `以下のテキスト群は、ある回答者グループが設問「${group.question_text}」に対して示した理由です。
彼らがなぜこの立場を取るかを100字以内の日本語で要約してください。前置きや「要約:」などのラベルは付けず、要約本文のみを出力してください。

テキスト群:
${textBlock}`;

  let summary = "";
  try {
    summary = (
      await callOpenRouter([{ role: "user", content: prompt }], {
        maxTokens: 200,
        temperature: 0.3,
      })
    ).trim();
  } catch (e) {
    console.error("summarizeClusterQuestion failed:", e);
  }

  return {
    cluster_id: group.cluster_id,
    question_id: group.question_id,
    summary,
    diversity_score: diversity,
    n_texts: n,
  };
}

export async function summarizeAllGroups(
  groups: ClusterQuestionGroup[],
): Promise<ClusterQuestionSummary[]> {
  // 並列度を制限して逐次に近い処理（OpenRouter & llm_cache負荷の都合）
  const results: ClusterQuestionSummary[] = [];
  const CONCURRENCY = 3;
  for (let i = 0; i < groups.length; i += CONCURRENCY) {
    const batch = groups.slice(i, i + CONCURRENCY);
    const r = await Promise.all(batch.map(summarizeClusterQuestion));
    results.push(...r);
  }
  return results;
}
