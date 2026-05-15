// ============================================================
// Embedding 取得: OpenRouter経由 (text-embedding-3-small, 1536次元)
// 結果は answer_embeddings テーブルに永続化
// ============================================================

import {
  callOpenRouterEmbedding,
  EMBEDDING_DIM,
  EMBEDDING_MODEL,
} from "./openrouter";
import { createAdminClient } from "./supabase";

async function sha256(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface AnswerForEmbedding {
  answer_id: string;
  session_id: string;
  question_id: string;
  text: string;
}

/**
 * 与えられた answers (自由記述あり) を embedding化し、answer_embeddings に upsert する。
 * text_hash で既存をスキップ。冪等。
 */
export async function ensureEmbeddings(
  answers: AnswerForEmbedding[],
): Promise<Map<string, number[]>> {
  const supabase = createAdminClient();
  const result = new Map<string, number[]>(); // answer_id -> embedding

  if (answers.length === 0) return result;

  const hashed = await Promise.all(
    answers.map(async (a) => ({ ...a, text_hash: await sha256(a.text) })),
  );

  // 既存 embedding を一括取得
  const answerIds = hashed.map((a) => a.answer_id);
  const { data: existing } = await supabase
    .from("answer_embeddings")
    .select("answer_id, text_hash, embedding")
    .in("answer_id", answerIds);

  const existingByAnswer = new Map<
    string,
    { text_hash: string; embedding: number[] | string }
  >();
  for (const row of existing ?? []) {
    existingByAnswer.set(row.answer_id, {
      text_hash: row.text_hash,
      embedding: row.embedding as unknown as number[] | string,
    });
  }

  // 同じテキストに対するAPI呼び出しを重複させないキャッシュ
  const hashToEmbedding = new Map<string, number[]>();
  for (const e of existingByAnswer.values()) {
    const emb = parseEmbedding(e.embedding);
    if (emb) hashToEmbedding.set(e.text_hash, emb);
  }

  const toUpsert: Array<{
    answer_id: string;
    session_id: string;
    question_id: string;
    text_hash: string;
    embedding: string;
    model: string;
  }> = [];

  for (const a of hashed) {
    const existingRow = existingByAnswer.get(a.answer_id);
    if (existingRow && existingRow.text_hash === a.text_hash) {
      const emb = parseEmbedding(existingRow.embedding);
      if (emb) {
        result.set(a.answer_id, emb);
        continue;
      }
    }

    let emb = hashToEmbedding.get(a.text_hash);
    if (!emb) {
      emb = await callOpenRouterEmbedding(a.text);
      hashToEmbedding.set(a.text_hash, emb);
    }
    result.set(a.answer_id, emb);
    toUpsert.push({
      answer_id: a.answer_id,
      session_id: a.session_id,
      question_id: a.question_id,
      text_hash: a.text_hash,
      embedding: `[${emb.join(",")}]`,
      model: EMBEDDING_MODEL,
    });
  }

  if (toUpsert.length > 0) {
    const { error } = await supabase
      .from("answer_embeddings")
      .upsert(toUpsert as never, { onConflict: "answer_id" });
    if (error) console.error("answer_embeddings upsert failed:", error);
  }

  return result;
}

function parseEmbedding(
  value: number[] | string | null | undefined,
): number[] | null {
  if (!value) return null;
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.replace(/^\[/, "").replace(/\]$/, "");
    if (!trimmed) return null;
    const arr = trimmed.split(",").map(Number);
    if (arr.some(Number.isNaN)) return null;
    return arr;
  }
  return null;
}

export function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 1;
  return 1 - dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function meanPairwiseCosineDistance(
  embeddings: number[][],
): number | null {
  if (embeddings.length < 2) return null;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < embeddings.length; i++) {
    for (let j = i + 1; j < embeddings.length; j++) {
      sum += cosineDistance(embeddings[i], embeddings[j]);
      n++;
    }
  }
  return n === 0 ? null : sum / n;
}

export { EMBEDDING_DIM, EMBEDDING_MODEL };
