"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SURVEY_QUESTIONS } from "@/lib/survey-data";

const CLUSTER_COLORS = [
  "#e74c3c",
  "#2ecc71",
  "#f39c12",
  "#8e6f47",
  "#9b59b6",
  "#3498db",
];

interface ClusterRun {
  id: string;
  calculated_at: string | null;
  n_respondents: number;
  n_questions: number;
  k_chosen: number;
  silhouette_score: number | null;
  pca_explained_variance: number[];
  pca_loadings: Record<string, { pc1: number; pc2: number }>;
  axis_labels: {
    pc1?: { positive?: string; negative?: string };
    pc2?: { positive?: string; negative?: string };
  } | null;
  silhouette_by_k: Record<string, number> | null;
  question_ids: string[];
  reasons_built_at: string | null;
}

interface Assignment {
  session_id: string;
  cluster_id: number;
  pc1: number;
  pc2: number;
}

interface Summary {
  cluster_id: number;
  question_id: string;
  summary: string;
  diversity_score: number | null;
  n_texts: number;
  mean_in: number | null;
  mean_out: number | null;
  diff: number | null;
  representativeness: number | null;
}

interface Insight {
  question_id: string;
  insight_text: string;
  dominant_axis: "pc1" | "pc2" | null;
  disagreement_std: number | null;
}

interface LatestPayload {
  run: ClusterRun | null;
  assignments: Assignment[];
  summaries: Summary[];
  insights: Insight[];
}

const QUESTION_TEXTS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const q of SURVEY_QUESTIONS) out[q.id] = q.text;
  return out;
})();

function questionOrder(qid: string): number {
  return Number.parseInt(qid.replace(/\D/g, ""), 10) || 0;
}

export function ClusterAnalysisTab({ password }: { password: string }) {
  const [payload, setPayload] = useState<LatestPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecomputing, setIsRecomputing] = useState(false);
  const [isBuildingReasons, setIsBuildingReasons] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"default" | "high" | "low">("default");

  const fetchLatest = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cluster/latest", {
        headers: { Authorization: `Bearer ${password}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as LatestPayload;
      setPayload(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, [password]);

  useEffect(() => {
    fetchLatest();
  }, [fetchLatest]);

  const handleRecompute = async () => {
    setIsRecomputing(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cluster/recompute", {
        method: "POST",
        headers: { Authorization: `Bearer ${password}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      await fetchLatest();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRecomputing(false);
    }
  };

  const handleBuildReasons = async () => {
    setIsBuildingReasons(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cluster/build-reasons", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${password}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      await fetchLatest();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsBuildingReasons(false);
    }
  };

  const handleDownloadJson = () => {
    if (!payload) return;
    const ts =
      payload.run?.calculated_at?.replace(/[:.]/g, "-").slice(0, 19) ||
      new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cluster-analysis-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const run = payload?.run ?? null;
  const assignments = payload?.assignments ?? [];
  const summaries = payload?.summaries ?? [];
  const insights = payload?.insights ?? [];

  const clusterSizes = useMemo(() => {
    const out = new Map<number, number>();
    for (const a of assignments)
      out.set(a.cluster_id, (out.get(a.cluster_id) ?? 0) + 1);
    return out;
  }, [assignments]);

  const clusterIds = useMemo(
    () => [...clusterSizes.keys()].sort((a, b) => a - b),
    [clusterSizes],
  );

  const questionList = useMemo(() => {
    const qids = run?.question_ids ?? [
      ...new Set(summaries.map((s) => s.question_id)),
    ];
    const items = qids.map((qid) => {
      const ins = insights.find((i) => i.question_id === qid);
      return {
        qid,
        disagreement: ins?.disagreement_std ?? null,
      };
    });
    if (sortBy === "high") {
      items.sort(
        (a, b) => (b.disagreement ?? -Infinity) - (a.disagreement ?? -Infinity),
      );
    } else if (sortBy === "low") {
      items.sort(
        (a, b) => (a.disagreement ?? Infinity) - (b.disagreement ?? Infinity),
      );
    } else {
      items.sort((a, b) => questionOrder(a.qid) - questionOrder(b.qid));
    }
    return items;
  }, [run, summaries, insights, sortBy]);

  const selectedInsight = useMemo(
    () =>
      selectedQuestion
        ? insights.find((i) => i.question_id === selectedQuestion)
        : undefined,
    [insights, selectedQuestion],
  );

  const selectedSummaries = useMemo(() => {
    if (!selectedQuestion) return [];
    return summaries
      .filter((s) => s.question_id === selectedQuestion)
      .sort((a, b) => a.cluster_id - b.cluster_id);
  }, [summaries, selectedQuestion]);

  const polarityGroups = useMemo(() => {
    if (!selectedQuestion || !selectedInsight)
      return { positive: [], negative: [] };
    const axis = selectedInsight.dominant_axis ?? "pc1";
    const clusterCoords = new Map<number, { pc1: number; pc2: number }>();
    for (const a of assignments) {
      if (!clusterCoords.has(a.cluster_id)) {
        clusterCoords.set(a.cluster_id, { pc1: 0, pc2: 0 });
      }
    }
    // クラスタ重心
    const accum = new Map<number, { pc1: number; pc2: number; n: number }>();
    for (const a of assignments) {
      const acc = accum.get(a.cluster_id) ?? { pc1: 0, pc2: 0, n: 0 };
      acc.pc1 += a.pc1;
      acc.pc2 += a.pc2;
      acc.n += 1;
      accum.set(a.cluster_id, acc);
    }
    for (const [cid, acc] of accum) {
      clusterCoords.set(cid, { pc1: acc.pc1 / acc.n, pc2: acc.pc2 / acc.n });
    }
    const positive: Summary[] = [];
    const negative: Summary[] = [];
    for (const s of selectedSummaries) {
      const coord = clusterCoords.get(s.cluster_id);
      if (!coord) continue;
      const value = axis === "pc1" ? coord.pc1 : coord.pc2;
      if (value >= 0) positive.push(s);
      else negative.push(s);
    }
    return { positive, negative };
  }, [selectedQuestion, selectedInsight, assignments, selectedSummaries]);

  const scatterBounds = useMemo(() => {
    if (assignments.length === 0) {
      return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const a of assignments) {
      if (a.pc1 < minX) minX = a.pc1;
      if (a.pc1 > maxX) maxX = a.pc1;
      if (a.pc2 < minY) minY = a.pc2;
      if (a.pc2 > maxY) maxY = a.pc2;
    }
    const padX = (maxX - minX) * 0.1 || 0.5;
    const padY = (maxY - minY) * 0.1 || 0.5;
    return {
      minX: minX - padX,
      maxX: maxX + padX,
      minY: minY - padY,
      maxY: maxY + padY,
    };
  }, [assignments]);

  if (isLoading && !payload) {
    return <div className="text-sm text-text-muted">読み込み中...</div>;
  }

  if (!run) {
    return (
      <div className="space-y-4">
        <div className="bg-white border border-border rounded-xl p-6">
          <h3 className="font-semibold mb-2">クラスター分析</h3>
          <p className="text-sm text-text-secondary mb-4">
            まだ計算結果がありません。「再計算」ボタンを押して PCA + k-means
            を実行してください。
          </p>
          <button
            type="button"
            onClick={handleRecompute}
            disabled={isRecomputing}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {isRecomputing ? "計算中..." : "再計算を実行"}
          </button>
          {error && <p className="text-sm text-error mt-3">{error}</p>}
        </div>
      </div>
    );
  }

  const pc1Var = run.pca_explained_variance?.[0] ?? 0;
  const pc2Var = run.pca_explained_variance?.[1] ?? 0;

  return (
    <div className="space-y-4">
      {/* Run meta + actions */}
      <div className="bg-white border border-border rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="text-xs text-text-secondary space-x-3">
          <span>
            計算:{" "}
            {run.calculated_at
              ? new Date(run.calculated_at).toLocaleString("ja-JP")
              : "—"}
          </span>
          <span>n={run.n_respondents}</span>
          <span>K={run.k_chosen}</span>
          <span>silhouette={run.silhouette_score?.toFixed(3) ?? "—"}</span>
          <span>
            理由要約:{" "}
            {run.reasons_built_at
              ? new Date(run.reasons_built_at).toLocaleString("ja-JP")
              : "未実行"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRecompute}
            disabled={isRecomputing || isBuildingReasons}
            className="px-3 py-1.5 bg-primary text-white rounded-md text-xs font-medium disabled:opacity-50"
          >
            {isRecomputing ? "再計算中..." : "再計算"}
          </button>
          <button
            type="button"
            onClick={handleBuildReasons}
            disabled={isRecomputing || isBuildingReasons}
            className="px-3 py-1.5 bg-accent text-white rounded-md text-xs font-medium disabled:opacity-50"
          >
            {isBuildingReasons ? "要約生成中..." : "理由を要約"}
          </button>
          <button
            type="button"
            onClick={handleDownloadJson}
            disabled={!payload?.run}
            className="px-3 py-1.5 border border-border text-text rounded-md text-xs font-medium disabled:opacity-50 hover:bg-surface"
          >
            JSONダウンロード
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: scatter + axis labels + selected question detail */}
        <div className="space-y-4">
          <div className="bg-white border border-border rounded-xl p-4">
            <h4 className="font-semibold text-sm mb-2">意見空間 (PCA)</h4>
            <div className="text-[11px] text-text-muted mb-3 space-y-0.5">
              <div>
                <b>PC1 ({(pc1Var * 100).toFixed(1)}%):</b>{" "}
                {run.axis_labels?.pc1?.negative || "−"} ⇔{" "}
                {run.axis_labels?.pc1?.positive || "+"}
              </div>
              <div>
                <b>PC2 ({(pc2Var * 100).toFixed(1)}%):</b>{" "}
                {run.axis_labels?.pc2?.negative || "−"} ⇔{" "}
                {run.axis_labels?.pc2?.positive || "+"}
              </div>
            </div>
            <ScatterPlot
              assignments={assignments}
              bounds={scatterBounds}
              clusterIds={clusterIds}
            />
            <div className="flex flex-wrap gap-3 mt-2">
              {clusterIds.map((c) => (
                <div key={c} className="flex items-center gap-1.5">
                  <div
                    className="w-3 h-3 rounded"
                    style={{
                      backgroundColor:
                        CLUSTER_COLORS[c % CLUSTER_COLORS.length],
                    }}
                  />
                  <span className="text-[11px] text-text-muted">
                    Cluster {c} (n={clusterSizes.get(c) ?? 0})
                  </span>
                </div>
              ))}
            </div>
          </div>

          {selectedQuestion && (
            <div className="bg-white border border-border rounded-xl p-4 space-y-3">
              <div>
                <h4 className="font-semibold text-sm">
                  {selectedQuestion.toUpperCase()}
                </h4>
                <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                  {QUESTION_TEXTS[selectedQuestion]}
                </p>
              </div>
              {selectedInsight?.insight_text && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 text-xs leading-relaxed">
                  <b className="text-yellow-700">分析:</b>{" "}
                  {selectedInsight.insight_text}
                </div>
              )}
              <PolaritySection
                axis={selectedInsight?.dominant_axis ?? "pc1"}
                axisLabels={run.axis_labels}
                positive={polarityGroups.positive}
                negative={polarityGroups.negative}
              />
            </div>
          )}
        </div>

        {/* Right: question list */}
        <div className="bg-white border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-sm">質問一覧</h4>
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as "default" | "high" | "low")
              }
              className="text-xs px-2 py-1 border border-border rounded"
            >
              <option value="default">設問順</option>
              <option value="high">不合意度 高→低</option>
              <option value="low">不合意度 低→高</option>
            </select>
          </div>
          <div className="space-y-1 max-h-[600px] overflow-y-auto">
            {questionList.map((item) => {
              const isSelected = item.qid === selectedQuestion;
              return (
                <button
                  type="button"
                  key={item.qid}
                  onClick={() => setSelectedQuestion(item.qid)}
                  className={`block w-full text-left p-2 rounded border-l-4 ${
                    isSelected
                      ? "bg-blue-50 border-blue-400"
                      : "bg-white border-transparent hover:bg-gray-50"
                  }`}
                >
                  <div className="text-xs font-medium">
                    {item.qid.toUpperCase()}
                    {item.disagreement !== null && (
                      <span className="ml-2 text-text-muted font-normal">
                        (不合意度 {item.disagreement.toFixed(2)})
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">
                    {QUESTION_TEXTS[item.qid]?.slice(0, 70)}
                    {QUESTION_TEXTS[item.qid] &&
                    QUESTION_TEXTS[item.qid].length > 70
                      ? "..."
                      : ""}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScatterPlot({
  assignments,
  bounds,
  clusterIds,
}: {
  assignments: Assignment[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  clusterIds: number[];
}) {
  const width = 480;
  const height = 360;
  const padding = 30;

  const toX = (v: number) =>
    padding +
    ((v - bounds.minX) / (bounds.maxX - bounds.minX)) * (width - padding * 2);
  const toY = (v: number) =>
    height -
    padding -
    ((v - bounds.minY) / (bounds.maxY - bounds.minY)) * (height - padding * 2);

  const zeroX = toX(0);
  const zeroY = toY(0);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto bg-gray-50 rounded"
      role="img"
      aria-label="Opinion space scatter plot"
    >
      <title>Opinion space (PCA scatter)</title>
      {/* Axes (zero lines) */}
      <line
        x1={zeroX}
        y1={padding}
        x2={zeroX}
        y2={height - padding}
        stroke="#ccc"
        strokeWidth="0.5"
      />
      <line
        x1={padding}
        y1={zeroY}
        x2={width - padding}
        y2={zeroY}
        stroke="#ccc"
        strokeWidth="0.5"
      />
      {/* Border */}
      <rect
        x={padding}
        y={padding}
        width={width - padding * 2}
        height={height - padding * 2}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth="1"
      />
      {assignments.map((a) => {
        const color = CLUSTER_COLORS[a.cluster_id % CLUSTER_COLORS.length];
        return (
          <circle
            key={a.session_id}
            cx={toX(a.pc1)}
            cy={toY(a.pc2)}
            r={4}
            fill={color}
            fillOpacity={0.7}
            stroke="#fff"
            strokeWidth={0.5}
          >
            <title>
              Cluster {a.cluster_id} / session {a.session_id.slice(0, 8)}
            </title>
          </circle>
        );
      })}
      {/* Cluster labels (k=center label) */}
      {clusterIds.map((c) => {
        const points = assignments.filter((a) => a.cluster_id === c);
        if (points.length === 0) return null;
        const cx = points.reduce((s, p) => s + p.pc1, 0) / points.length;
        const cy = points.reduce((s, p) => s + p.pc2, 0) / points.length;
        return (
          <text
            key={`label-${c}`}
            x={toX(cx)}
            y={toY(cy)}
            textAnchor="middle"
            dy={-6}
            fontSize="11"
            fontWeight="bold"
            fill="#333"
            stroke="#fff"
            strokeWidth="3"
            paintOrder="stroke"
          >
            C{c}
          </text>
        );
      })}
    </svg>
  );
}

function PolaritySection({
  axis,
  axisLabels,
  positive,
  negative,
}: {
  axis: "pc1" | "pc2";
  axisLabels: ClusterRun["axis_labels"];
  positive: Summary[];
  negative: Summary[];
}) {
  const labels = axisLabels?.[axis];
  const posLabel = labels?.positive || `${axis.toUpperCase()}+`;
  const negLabel = labels?.negative || `${axis.toUpperCase()}-`;

  return (
    <div className="space-y-3 text-xs">
      <div>
        <div className="px-2 py-1 bg-amber-100 rounded text-[11px] font-semibold mb-2">
          {axis.toUpperCase()}+ ({posLabel})
        </div>
        {positive.length === 0 ? (
          <p className="text-text-muted">該当クラスタなし</p>
        ) : (
          positive.map((s) => (
            <SummaryCard key={`pos-${s.cluster_id}`} summary={s} />
          ))
        )}
      </div>
      <div>
        <div className="px-2 py-1 bg-amber-100 rounded text-[11px] font-semibold mb-2">
          {axis.toUpperCase()}- ({negLabel})
        </div>
        {negative.length === 0 ? (
          <p className="text-text-muted">該当クラスタなし</p>
        ) : (
          negative.map((s) => (
            <SummaryCard key={`neg-${s.cluster_id}`} summary={s} />
          ))
        )}
      </div>
    </div>
  );
}

function SummaryCard({ summary }: { summary: Summary }) {
  const color = CLUSTER_COLORS[summary.cluster_id % CLUSTER_COLORS.length];
  return (
    <div
      className="mb-2 p-2 bg-white border-l-4 rounded"
      style={{ borderLeftColor: color }}
    >
      <div className="font-semibold mb-1">Cluster {summary.cluster_id}</div>
      <div className="text-text-secondary leading-relaxed">
        {summary.summary || "(要約未生成)"}
      </div>
      <div className="text-[10px] text-text-muted mt-1">
        n={summary.n_texts} ・ Diversity:{" "}
        {summary.diversity_score !== null &&
        summary.diversity_score !== undefined
          ? summary.diversity_score.toFixed(3)
          : "—"}
      </div>
    </div>
  );
}
