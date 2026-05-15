// ============================================================
// クラスタリング・PCA パイプライン
// Issue #26: リッカートデータのクラスタリングと可視化
// Polis流: 列平均補完 → センタリング → PCA → kmeans (silhouette最良K)
// ============================================================

import { kmeans } from "ml-kmeans";
import { PCA } from "ml-pca";
import { numericFromLikert } from "./likert";

export interface AnswerInput {
  session_id: string;
  question_id: string;
  likert: string | null;
  is_followup: boolean | null;
}

export interface ResponseMatrix {
  sessionIds: string[];
  questionIds: string[];
  values: number[][];
  rawValues: (number | null)[][];
}

export interface PCAResult {
  coords: number[][];
  explainedVariance: number[];
  loadings: { pc1: number[]; pc2: number[] };
  loadingsByQuestion: Record<string, { pc1: number; pc2: number }>;
}

export interface KMeansResult {
  bestK: number;
  labels: number[];
  silhouette: number;
  silhouetteByK: Record<number, number>;
}

export interface RepresentativenessRow {
  cluster_id: number;
  question_id: string;
  mean_in: number;
  mean_out: number;
  diff: number;
  representativeness: number;
}

// ────────────────────────────────────────────────────────────
// 1. matrix構築
// ────────────────────────────────────────────────────────────
export function buildResponseMatrix(
  answers: AnswerInput[],
  options?: { minAnsweredPerSession?: number },
): ResponseMatrix {
  const minAnswered = options?.minAnsweredPerSession ?? 1;

  // is_followup=false の Likert回答のみ対象
  const baseAnswers = answers.filter((a) => !a.is_followup && a.likert);

  // 出現したquestion_idを収集（survey-data.tsとは独立。answers側で完結）
  const qidSet = new Set<string>();
  for (const a of baseAnswers) qidSet.add(a.question_id);
  const questionIds = [...qidSet].sort((a, b) => {
    const na = Number.parseInt(a.replace(/\D/g, ""), 10) || 0;
    const nb = Number.parseInt(b.replace(/\D/g, ""), 10) || 0;
    return na - nb;
  });

  // session_idごとに集約
  const bySession = new Map<string, Map<string, number | null>>();
  for (const a of baseAnswers) {
    if (!bySession.has(a.session_id)) bySession.set(a.session_id, new Map());
    bySession
      .get(a.session_id)
      ?.set(a.question_id, numericFromLikert(a.likert));
  }

  // 最低回答数フィルタ
  const sessionIds: string[] = [];
  const rawValues: (number | null)[][] = [];
  for (const [sid, qMap] of bySession.entries()) {
    const row = questionIds.map((qid) => qMap.get(qid) ?? null);
    const answered = row.filter((v) => v !== null).length;
    if (answered >= minAnswered) {
      sessionIds.push(sid);
      rawValues.push(row);
    }
  }

  // 列平均補完
  const values = rawValues.map((row) => row.slice()) as (number | null)[][];
  for (let j = 0; j < questionIds.length; j++) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < values.length; i++) {
      const v = values[i][j];
      if (v !== null) {
        sum += v;
        count++;
      }
    }
    const mean = count > 0 ? sum / count : 0;
    for (let i = 0; i < values.length; i++) {
      if (values[i][j] === null) values[i][j] = mean;
    }
  }

  return {
    sessionIds,
    questionIds,
    values: values as number[][],
    rawValues,
  };
}

// ────────────────────────────────────────────────────────────
// 2. PCA (2次元へ射影、Polis流: center=true, scale=false)
// ────────────────────────────────────────────────────────────
export function runPCA(matrix: ResponseMatrix): PCAResult {
  const { values, questionIds } = matrix;
  const pca = new PCA(values, { center: true, scale: false });
  const projected = pca.predict(values, { nComponents: 2 });
  const coords: number[][] = [];
  for (let i = 0; i < projected.rows; i++) {
    coords.push([projected.get(i, 0), projected.get(i, 1)]);
  }
  const explained = pca.getExplainedVariance().slice(0, 2);

  // Loadings: rows=features (questions), cols=components.
  // ml-pca の getLoadings() は components × features の行列を返す
  const loadingsMatrix = pca.getLoadings();
  const pc1: number[] = [];
  const pc2: number[] = [];
  const loadingsByQuestion: Record<string, { pc1: number; pc2: number }> = {};
  for (let j = 0; j < questionIds.length; j++) {
    const v1 = loadingsMatrix.get(0, j);
    const v2 = loadingsMatrix.get(1, j);
    pc1.push(v1);
    pc2.push(v2);
    loadingsByQuestion[questionIds[j]] = { pc1: v1, pc2: v2 };
  }

  return {
    coords,
    explainedVariance: explained,
    loadings: { pc1, pc2 },
    loadingsByQuestion,
  };
}

// ────────────────────────────────────────────────────────────
// 3. シルエットスコア（自前実装）
// ────────────────────────────────────────────────────────────
function euclideanDistance(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

export function silhouetteScore(coords: number[][], labels: number[]): number {
  const n = coords.length;
  if (n === 0) return 0;
  const clusters = new Set(labels);
  if (clusters.size < 2) return 0;

  // 各点と各クラスタの距離を事前計算
  const scores: number[] = [];
  for (let i = 0; i < n; i++) {
    const own = labels[i];
    const inCluster: number[] = [];
    const byOther = new Map<number, number[]>();
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const d = euclideanDistance(coords[i], coords[j]);
      if (labels[j] === own) {
        inCluster.push(d);
      } else {
        if (!byOther.has(labels[j])) byOther.set(labels[j], []);
        byOther.get(labels[j])?.push(d);
      }
    }
    const a =
      inCluster.length > 0
        ? inCluster.reduce((s, v) => s + v, 0) / inCluster.length
        : 0;
    let b = Number.POSITIVE_INFINITY;
    for (const ds of byOther.values()) {
      const meanD = ds.reduce((s, v) => s + v, 0) / ds.length;
      if (meanD < b) b = meanD;
    }
    const s = inCluster.length === 0 ? 0 : (b - a) / Math.max(a, b);
    scores.push(s);
  }
  return scores.reduce((s, v) => s + v, 0) / scores.length;
}

// ────────────────────────────────────────────────────────────
// 4. kmeans + best K (K=2..6)
// ────────────────────────────────────────────────────────────
export function runKMeansWithBestK(
  coords: number[][],
  options?: { kRange?: number[]; seed?: number; nInit?: number },
): KMeansResult {
  const kRange = options?.kRange ?? [2, 3, 4, 5, 6];
  const seed = options?.seed ?? 42;
  const nInit = options?.nInit ?? 10;

  const byK: Record<number, { labels: number[]; score: number }> = {};
  for (const k of kRange) {
    if (coords.length < k) continue;
    let bestLabels: number[] = [];
    let bestSse = Number.POSITIVE_INFINITY;
    // 複数回初期化して最良SSEを選ぶ（sklearn n_init相当）
    for (let r = 0; r < nInit; r++) {
      const res = kmeans(coords, k, {
        seed: seed + r,
        initialization: "kmeans++",
        maxIterations: 300,
      });
      // SSE: 各点と所属centroidの2乗距離合計
      let sse = 0;
      for (let i = 0; i < coords.length; i++) {
        const c = res.centroids[res.clusters[i]];
        const d = euclideanDistance(coords[i], c);
        sse += d * d;
      }
      if (sse < bestSse) {
        bestSse = sse;
        bestLabels = res.clusters.slice();
      }
    }
    byK[k] = { labels: bestLabels, score: silhouetteScore(coords, bestLabels) };
  }

  let bestK = kRange[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  const silhouetteByK: Record<number, number> = {};
  for (const k of Object.keys(byK).map(Number)) {
    silhouetteByK[k] = byK[k].score;
    if (byK[k].score > bestScore) {
      bestScore = byK[k].score;
      bestK = k;
    }
  }

  return {
    bestK,
    labels: byK[bestK].labels,
    silhouette: bestScore,
    silhouetteByK,
  };
}

// ────────────────────────────────────────────────────────────
// 5. クラスタ代表設問: 群内平均 vs 群外平均
// ────────────────────────────────────────────────────────────
export function computeRepresentativeness(
  matrix: ResponseMatrix,
  labels: number[],
): RepresentativenessRow[] {
  const { values, questionIds } = matrix;
  const clusters = [...new Set(labels)].sort((a, b) => a - b);

  const rows: RepresentativenessRow[] = [];
  for (const c of clusters) {
    const inIdx = labels.flatMap((l, i) => (l === c ? [i] : []));
    const outIdx = labels.flatMap((l, i) => (l !== c ? [i] : []));
    for (let j = 0; j < questionIds.length; j++) {
      const inVals = inIdx.map((i) => values[i][j]);
      const outVals = outIdx.map((i) => values[i][j]);
      const meanIn = inVals.length
        ? inVals.reduce((s, v) => s + v, 0) / inVals.length
        : 0;
      const meanOut = outVals.length
        ? outVals.reduce((s, v) => s + v, 0) / outVals.length
        : 0;
      const diff = meanIn - meanOut;
      // 代表性スコア = |diff| を使用（Polisの比率検定の代替として単純化）
      rows.push({
        cluster_id: c,
        question_id: questionIds[j],
        mean_in: meanIn,
        mean_out: meanOut,
        diff,
        representativeness: Math.abs(diff),
      });
    }
  }
  return rows;
}

// ────────────────────────────────────────────────────────────
// 6. 質問ごとの dominant axis と disagreement (cluster間)
// ────────────────────────────────────────────────────────────
export interface QuestionAxisInfo {
  question_id: string;
  dominant_axis: "pc1" | "pc2";
  disagreement_std: number; // クラスタ間平均値の標準偏差（合意/不合意度の指標）
}

export function computeQuestionAxes(
  matrix: ResponseMatrix,
  pcaResult: PCAResult,
  labels: number[],
): QuestionAxisInfo[] {
  const { values, questionIds } = matrix;
  const clusters = [...new Set(labels)].sort((a, b) => a - b);

  return questionIds.map((qid, j) => {
    const { pc1, pc2 } = pcaResult.loadingsByQuestion[qid];
    const dominant: "pc1" | "pc2" =
      Math.abs(pc1) >= Math.abs(pc2) ? "pc1" : "pc2";

    // クラスタ間平均値の標準偏差
    const clusterMeans = clusters.map((c) => {
      const idx = labels.flatMap((l, i) => (l === c ? [i] : []));
      if (idx.length === 0) return 0;
      return idx.reduce((s, i) => s + values[i][j], 0) / idx.length;
    });
    const overallMean =
      clusterMeans.reduce((s, v) => s + v, 0) / clusterMeans.length;
    const variance =
      clusterMeans.reduce((s, v) => s + (v - overallMean) ** 2, 0) /
      clusterMeans.length;
    const std = Math.sqrt(variance);

    return { question_id: qid, dominant_axis: dominant, disagreement_std: std };
  });
}
