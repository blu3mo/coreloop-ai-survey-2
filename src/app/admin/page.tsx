"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  INTEREST_OPTIONS,
  LIKERT_OPTIONS,
  SURVEY_QUESTIONS,
} from "@/lib/survey-data";
import { ClusterAnalysisTab } from "./ClusterAnalysisTab";

interface AnswerRow {
  question_id: string;
  question_text: string | null;
  likert: string | null;
  freetext: string | null;
  is_followup: boolean | null;
}

interface SessionRow {
  session_id: string;
  interest_level: number | null;
  interest_reasons: string[] | null;
  interest_other_text: string | null;
  additional_comments: string | null;
  page_completed: number | null;
  user_agent: string | null;
  created_at: string | null;
  completed_at: string | null;
}

interface FollowupEntry {
  question_id: string;
  text: string;
  likert: string;
  freetext: string;
}

interface AdminData {
  summary: {
    total: number;
    completed: number;
    page1Only: number;
    startedButNotCompleted: number;
  };
  interestDistribution: Record<string, number>;
  likertDistributions: Record<string, Record<string, number>>;
  followupBySession: Record<string, FollowupEntry[]>;
  sessions: SessionRow[];
  answersBySession: Record<string, AnswerRow[]>;
}

const INTEREST_LABELS: Record<string, string> = {};
for (const opt of INTEREST_OPTIONS) {
  INTEREST_LABELS[opt.value] = opt.label;
}

const LIKERT_LABELS: Record<string, string> = {};
for (const opt of LIKERT_OPTIONS) {
  LIKERT_LABELS[opt.value] = opt.label;
}

const LIKERT_COLORS: Record<string, string> = {
  strongly_agree: "bg-blue-600",
  agree: "bg-blue-400",
  neutral: "bg-gray-400",
  disagree: "bg-orange-400",
  strongly_disagree: "bg-red-500",
  dont_know: "bg-gray-300",
};

const LIKERT_ORDER = [
  "strongly_disagree",
  "disagree",
  "neutral",
  "agree",
  "strongly_agree",
  "dont_know",
];

// Followup questions start after the base questions
const FOLLOWUP_START = SURVEY_QUESTIONS.length + 1; // Q14

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [data, setData] = useState<AdminData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "overview" | "q1-13" | "q14-18" | "responses" | "cluster"
  >("overview");
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(
    new Set(),
  );
  const [sortKey, setSortKey] = useState<string>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    content: ReactNode;
  } | null>(null);

  const toggleSession = (sessionId: string) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin", {
        headers: { Authorization: `Bearer ${password}` },
      });
      if (response.status === 401) {
        setIsAuthenticated(false);
        setError("パスワードが正しくありません。");
        return;
      }
      if (!response.ok) throw new Error("Failed to fetch data");
      const result = await response.json();
      setData(result);
      setIsAuthenticated(true);
    } catch (err) {
      console.error("Admin fetch error:", err);
      setError("データの取得に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  }, [password]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData();
  };

  const handleCsvDownload = async () => {
    try {
      const response = await fetch("/api/admin?format=csv", {
        headers: { Authorization: `Bearer ${password}` },
      });
      if (!response.ok) throw new Error("CSV download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `survey-responses-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("CSV download error:", err);
      setError("CSVのダウンロードに失敗しました。");
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, fetchData]);

  // Helper: get answers for a session as a map
  const getAnswerMap = useCallback(
    (sessionId: string): Record<string, AnswerRow> => {
      if (!data) return {};
      const map: Record<string, AnswerRow> = {};
      for (const a of data.answersBySession[sessionId] || []) {
        map[a.question_id] = a;
      }
      return map;
    },
    [data],
  );

  // Helper: collect free texts for a question from answersBySession
  const getFreetextsForQuestion = (
    questionId: string,
  ): { text: string; likert: string; sessionId: string }[] => {
    if (!data) return [];
    const results: { text: string; likert: string; sessionId: string }[] = [];
    for (const [sessionId, answers] of Object.entries(data.answersBySession)) {
      for (const a of answers) {
        if (a.question_id === questionId && a.freetext && a.freetext.trim()) {
          results.push({ text: a.freetext, likert: a.likert || "", sessionId });
        }
      }
    }
    return results;
  };

  // Jump to a specific response row in the responses tab
  const [highlightedSession, setHighlightedSession] = useState<string | null>(
    null,
  );
  const jumpToResponse = (sessionId: string) => {
    setActiveTab("responses");
    setHighlightedSession(sessionId);
    // Wait for tab switch render, then scroll
    setTimeout(() => {
      const el = document.getElementById(`row-${sessionId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Clear highlight after animation
        setTimeout(() => setHighlightedSession(null), 2000);
      }
    }, 100);
  };

  // Sorted sessions for responses tab
  const sortedSessions = useMemo(() => {
    if (!data) return [];
    const sessions = [...data.sessions];
    sessions.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") {
        cmp = (a.created_at || "").localeCompare(b.created_at || "");
      } else if (sortKey === "interest") {
        cmp = (a.interest_level || 0) - (b.interest_level || 0);
      } else if (sortKey === "status") {
        cmp = (a.page_completed || 0) - (b.page_completed || 0);
      } else {
        // Sort by a specific question's likert answer
        const aMap = getAnswerMap(a.session_id);
        const bMap = getAnswerMap(b.session_id);
        const aIdx = LIKERT_ORDER.indexOf(aMap[sortKey]?.likert || "");
        const bIdx = LIKERT_ORDER.indexOf(bMap[sortKey]?.likert || "");
        cmp = aIdx - bIdx;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sessions;
  }, [data, sortKey, sortDir, getAnswerMap]);

  // Show tooltip near a cell
  const showTooltip = (
    e: React.MouseEvent<HTMLElement>,
    content: ReactNode,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      x: rect.left + rect.width / 2,
      y: rect.bottom + 6,
      content,
    });
  };

  const hideTooltip = () => setTooltip(null);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <form
          onSubmit={handleLogin}
          className="bg-white border border-border rounded-xl p-8 shadow-sm max-w-sm w-full space-y-4"
        >
          <h1 className="text-lg font-bold text-text">管理者ダッシュボード</h1>
          <p className="text-sm text-text-secondary">
            パスワードを入力してください。
          </p>
          {error && <p className="text-sm text-error">{error}</p>}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワード"
            className="w-full px-4 py-2 border border-border rounded-lg text-sm"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-light transition-all"
          >
            {isLoading ? "読み込み中..." : "ログイン"}
          </button>
        </form>
      </div>
    );
  }

  if (!data) return null;

  // Sort indicator
  const SortHeader = ({ label, sortId }: { label: string; sortId: string }) => (
    <th
      className="px-2 py-2 text-left font-medium text-text-muted cursor-pointer hover:text-text select-none whitespace-nowrap"
      onClick={() => toggleSort(sortId)}
    >
      {label}
      {sortKey === sortId && (
        <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>
      )}
    </th>
  );

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-white border-b border-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-primary">
            管理者ダッシュボード
          </h1>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={fetchData}
              disabled={isLoading}
              className="text-sm text-accent hover:underline disabled:opacity-50"
            >
              {isLoading ? "更新中..." : "データを更新"}
            </button>
            <button
              type="button"
              onClick={handleCsvDownload}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-light transition-all"
            >
              CSVダウンロード
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="総回答数" value={data.summary.total} />
          <SummaryCard
            label="完了（2ページ目まで）"
            value={data.summary.completed}
          />
          <SummaryCard
            label="1ページ目のみ完了"
            value={data.summary.page1Only}
          />
          <SummaryCard
            label="完了率"
            value={
              data.summary.total > 0
                ? `${Math.round((data.summary.completed / data.summary.total) * 100)}%`
                : "—"
            }
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-border rounded-lg p-1">
          {(
            [
              ["overview", "概要"],
              ["q1-13", "Q1-Q13 詳細"],
              ["q14-18", "フォローアップ"],
              ["responses", "個別回答"],
              ["cluster", "クラスター分析"],
            ] as const
          ).map(([key, label]) => (
            <button
              type="button"
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === key
                  ? "bg-primary text-white"
                  : "text-text-secondary hover:bg-surface"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Interest Distribution */}
            <div className="bg-white border border-border rounded-xl p-6">
              <h3 className="font-semibold text-text mb-4">関心度の分布</h3>
              <div className="space-y-2">
                {INTEREST_OPTIONS.map((opt) => {
                  const count = data.interestDistribution[opt.value] || 0;
                  const total = data.summary.total || 1;
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={opt.value} className="flex items-center gap-3">
                      <span className="text-xs text-text-secondary w-32 shrink-0">
                        {opt.label}
                      </span>
                      <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                        <div
                          className="h-full bg-accent rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-text-muted w-16 text-right">
                        {count} ({pct}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Q1-Q13 Likert Summary */}
            <div className="bg-white border border-border rounded-xl p-6">
              <h3 className="font-semibold text-text mb-4">Q1-Q13 回答分布</h3>
              <div className="space-y-4">
                {SURVEY_QUESTIONS.map((q, i) => {
                  const dist = data.likertDistributions[q.id] || {};
                  const total =
                    Object.values(dist).reduce((s, v) => s + v, 0) || 1;
                  return (
                    <div key={q.id}>
                      <p className="text-xs text-text-secondary mb-1.5 leading-relaxed">
                        Q{i + 1}: {q.text.substring(0, 60)}...
                      </p>
                      <div className="flex h-6 rounded-md overflow-hidden">
                        {LIKERT_OPTIONS.map((opt) => {
                          const count = dist[opt.value] || 0;
                          const pct = (count / total) * 100;
                          if (pct === 0) return null;
                          return (
                            <div
                              key={opt.value}
                              className={`${LIKERT_COLORS[opt.value]} flex items-center justify-center text-white text-[10px] font-medium`}
                              style={{ width: `${pct}%` }}
                              title={`${opt.label}: ${count} (${Math.round(pct)}%)`}
                            >
                              {pct >= 8 ? `${Math.round(pct)}%` : ""}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {/* Legend */}
                <div className="flex flex-wrap gap-3 pt-2 border-t border-border">
                  {LIKERT_OPTIONS.map((opt) => (
                    <div key={opt.value} className="flex items-center gap-1.5">
                      <div
                        className={`w-3 h-3 rounded ${LIKERT_COLORS[opt.value]}`}
                      />
                      <span className="text-[10px] text-text-muted">
                        {opt.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "q1-13" && (
          <div className="space-y-6">
            {SURVEY_QUESTIONS.map((q, i) => {
              const dist = data.likertDistributions[q.id] || {};
              const total = Object.values(dist).reduce((s, v) => s + v, 0) || 1;
              const freetexts = getFreetextsForQuestion(q.id);

              return (
                <div
                  key={q.id}
                  className="bg-white border border-border rounded-xl p-6"
                >
                  <h3 className="font-semibold text-text mb-3">
                    Q{i + 1}: {q.text}
                  </h3>

                  {/* Bar chart */}
                  <div className="space-y-1.5 my-4">
                    {LIKERT_OPTIONS.map((opt) => {
                      const count = dist[opt.value] || 0;
                      const pct = (count / total) * 100;
                      return (
                        <div
                          key={opt.value}
                          className="flex items-center gap-2"
                        >
                          <span className="text-xs text-text-secondary w-36 shrink-0 text-right">
                            {opt.label}
                          </span>
                          <div className="flex-1 bg-gray-100 rounded h-5 overflow-hidden">
                            <div
                              className={`h-full ${LIKERT_COLORS[opt.value]} rounded transition-all`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-text-muted w-16 shrink-0">
                            {count} ({Math.round(pct)}%)
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Free text responses grouped by likert */}
                  <details>
                    <summary className="text-sm text-accent cursor-pointer hover:underline">
                      自由記述回答を見る ({freetexts.length}件)
                    </summary>
                    <div className="mt-3 space-y-3 max-h-[32rem] overflow-y-auto">
                      {freetexts.length === 0 ? (
                        <p className="text-sm text-text-muted">
                          自由記述回答はありません。
                        </p>
                      ) : (
                        (() => {
                          const grouped: Record<
                            string,
                            { text: string; sessionId: string }[]
                          > = {};
                          for (const ft of freetexts) {
                            const key = ft.likert || "_none";
                            if (!grouped[key]) grouped[key] = [];
                            grouped[key].push({
                              text: ft.text,
                              sessionId: ft.sessionId,
                            });
                          }
                          return LIKERT_OPTIONS.filter(
                            (opt) => grouped[opt.value]?.length,
                          ).map((opt) => (
                            <div key={opt.value}>
                              <div className="flex items-center gap-2 mb-1.5">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-xs text-white ${LIKERT_COLORS[opt.value]}`}
                                >
                                  {opt.label}
                                </span>
                                <span className="text-xs text-text-muted">
                                  {grouped[opt.value].length}件
                                </span>
                              </div>
                              <div className="space-y-1.5 ml-1 pl-3 border-l-2 border-border">
                                {grouped[opt.value].map((entry, j) => (
                                  <p
                                    key={`${opt.value}-${j}`}
                                    className="text-sm text-text-secondary leading-relaxed cursor-pointer hover:text-accent transition-colors"
                                    onClick={() =>
                                      jumpToResponse(entry.sessionId)
                                    }
                                  >
                                    {entry.text}
                                    <span className="ml-1 text-[10px] text-text-muted">
                                      →
                                    </span>
                                  </p>
                                ))}
                              </div>
                            </div>
                          ));
                        })()
                      )}
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "q14-18" && (
          <FollowupTab
            data={data}
            expandedSessions={expandedSessions}
            toggleSession={toggleSession}
            showTooltip={showTooltip}
            hideTooltip={hideTooltip}
            jumpToResponse={jumpToResponse}
          />
        )}

        {activeTab === "responses" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-secondary">
                全{data.sessions?.length || 0}件の回答
              </p>
              <div className="flex items-center gap-4">
                {/* Legend */}
                <div className="flex flex-wrap gap-2">
                  {LIKERT_OPTIONS.map((opt) => (
                    <div key={opt.value} className="flex items-center gap-1">
                      <span
                        className={`inline-block w-3 h-3 rounded-sm ${LIKERT_COLORS[opt.value]}`}
                      />
                      <span className="text-[10px] text-text-muted">
                        {opt.label}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleCsvDownload}
                  className="text-sm text-accent hover:underline shrink-0"
                >
                  CSVでダウンロード
                </button>
              </div>
            </div>
            <div className="overflow-x-auto bg-white border border-border rounded-xl">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface">
                    <SortHeader label="日時" sortId="date" />
                    <SortHeader label="関心度" sortId="interest" />
                    {SURVEY_QUESTIONS.map((q, i) => (
                      <SortHeader
                        key={q.id}
                        label={`Q${i + 1}`}
                        sortId={q.id}
                      />
                    ))}
                    {[0, 1, 2, 3, 4].map((i) => (
                      <th
                        key={`fh-${i}`}
                        className="px-2 py-2 text-left font-medium text-text-muted whitespace-nowrap"
                      >
                        Q{FOLLOWUP_START + i}
                      </th>
                    ))}
                    <SortHeader label="完了" sortId="status" />
                  </tr>
                </thead>
                <tbody>
                  {sortedSessions.map((s) => {
                    const answerMap = getAnswerMap(s.session_id);
                    const followups =
                      data.followupBySession[s.session_id] || [];
                    const isHighlighted = highlightedSession === s.session_id;
                    return (
                      <tr
                        key={s.session_id}
                        id={`row-${s.session_id}`}
                        className={`border-b border-border last:border-0 transition-colors duration-700 ${isHighlighted ? "bg-accent/15" : "hover:bg-surface/50"}`}
                      >
                        <td className="px-2 py-2 text-text-secondary whitespace-nowrap">
                          {s.created_at
                            ? new Date(s.created_at).toLocaleString("ja-JP", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </td>
                        <td className="px-2 py-2 text-text-secondary whitespace-nowrap">
                          {s.interest_level
                            ? INTEREST_LABELS[String(s.interest_level)] ||
                              String(s.interest_level)
                            : "—"}
                        </td>
                        {SURVEY_QUESTIONS.map((q) => {
                          const answer = answerMap[q.id];
                          return (
                            <td key={q.id} className="px-2 py-1.5">
                              <LikertDot
                                likert={answer?.likert || null}
                                freetext={answer?.freetext || null}
                                questionLabel={`Q${SURVEY_QUESTIONS.indexOf(q) + 1}`}
                                questionText={q.text}
                                showTooltip={showTooltip}
                                hideTooltip={hideTooltip}
                              />
                            </td>
                          );
                        })}
                        {[0, 1, 2, 3, 4].map((i) => {
                          const f = followups[i];
                          return (
                            <td key={`f-${i}`} className="px-2 py-1.5">
                              {f ? (
                                <LikertDot
                                  likert={f.likert || null}
                                  freetext={f.freetext || null}
                                  questionLabel={`Q${FOLLOWUP_START + i}`}
                                  questionText={f.text}
                                  showTooltip={showTooltip}
                                  hideTooltip={hideTooltip}
                                />
                              ) : (
                                <span className="text-text-muted">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-2 py-2 text-text-secondary">
                          {s.page_completed === 2
                            ? "✓"
                            : `P${s.page_completed}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "cluster" && <ClusterAnalysisTab password={password} />}
      </main>

      {/* Fixed tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 max-w-xs bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: "translateX(-50%)",
          }}
        >
          {tooltip.content}
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45" />
        </div>
      )}
    </div>
  );
}

// ============================================================
// LikertDot: colored square with hover tooltip
// ============================================================
function LikertDot({
  likert,
  freetext,
  questionLabel,
  questionText,
  showTooltip,
  hideTooltip,
}: {
  likert: string | null;
  freetext: string | null;
  questionLabel: string;
  questionText: string;
  showTooltip: (e: React.MouseEvent<HTMLElement>, content: ReactNode) => void;
  hideTooltip: () => void;
}) {
  if (!likert) return <span className="text-text-muted">—</span>;

  const color = LIKERT_COLORS[likert] || "bg-gray-300";
  const label = LIKERT_LABELS[likert] || likert;
  const hasFreetext = freetext && freetext.trim();

  const tooltipContent = (
    <div className="space-y-1.5">
      <p className="text-gray-400 text-[10px]">{questionLabel}</p>
      <p className="leading-relaxed">{questionText}</p>
      <p className="font-medium">{label}</p>
      {hasFreetext && (
        <p className="text-gray-300 border-t border-gray-700 pt-1.5 leading-relaxed">
          {freetext}
        </p>
      )}
    </div>
  );

  return (
    <div
      className="inline-flex items-center gap-0.5 cursor-default"
      onMouseEnter={(e) => showTooltip(e, tooltipContent)}
      onMouseLeave={hideTooltip}
    >
      <span className={`inline-block w-4 h-4 rounded-sm ${color}`} />
      {hasFreetext && (
        <span className="text-accent text-[10px] font-bold">*</span>
      )}
    </div>
  );
}

// ============================================================
// Q14-Q18 Followup Tab: grouped by respondent
// ============================================================
function FollowupTab({
  data,
  expandedSessions,
  toggleSession,
  showTooltip,
  hideTooltip,
  jumpToResponse,
}: {
  data: AdminData;
  expandedSessions: Set<string>;
  toggleSession: (id: string) => void;
  showTooltip: (e: React.MouseEvent<HTMLElement>, content: ReactNode) => void;
  hideTooltip: () => void;
  jumpToResponse: (sessionId: string) => void;
}) {
  const sessionsWithFollowup = (data.sessions || []).filter(
    (s) => data.followupBySession[s.session_id]?.length,
  );

  const totalFollowupSessions = sessionsWithFollowup.length;

  const overallDist: Record<string, number> = {};
  let totalFollowupAnswers = 0;
  for (const entries of Object.values(data.followupBySession)) {
    for (const entry of entries) {
      if (entry.likert) {
        overallDist[entry.likert] = (overallDist[entry.likert] || 0) + 1;
        totalFollowupAnswers++;
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <SummaryCard label="回答者数" value={totalFollowupSessions} />
        <SummaryCard label="回答総数" value={totalFollowupAnswers} />
        <div className="bg-white border border-border rounded-xl p-4">
          <p className="text-xs text-text-muted mb-2">回答傾向</p>
          {totalFollowupAnswers > 0 ? (
            <div className="flex h-5 rounded-md overflow-hidden">
              {LIKERT_OPTIONS.map((opt) => {
                const count = overallDist[opt.value] || 0;
                const pct = (count / totalFollowupAnswers) * 100;
                if (pct === 0) return null;
                return (
                  <div
                    key={opt.value}
                    className={`${LIKERT_COLORS[opt.value]} flex items-center justify-center text-white text-[10px] font-medium`}
                    style={{ width: `${pct}%` }}
                    title={`${opt.label}: ${count} (${Math.round(pct)}%)`}
                  >
                    {pct >= 10 ? `${Math.round(pct)}%` : ""}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-text-muted">—</p>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {LIKERT_OPTIONS.map((opt) => (
          <div key={opt.value} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded ${LIKERT_COLORS[opt.value]}`} />
            <span className="text-[10px] text-text-muted">{opt.label}</span>
          </div>
        ))}
      </div>

      {/* Per-respondent list */}
      {sessionsWithFollowup.length === 0 ? (
        <div className="bg-white border border-border rounded-xl p-6 text-center">
          <p className="text-sm text-text-muted">
            フォローアップ回答がありません。
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessionsWithFollowup.map((session) => {
            const followups = data.followupBySession[session.session_id] || [];
            const isExpanded = expandedSessions.has(session.session_id);
            const answeredCount = followups.filter((f) => f.likert).length;
            const dateStr = session.created_at
              ? new Date(session.created_at).toLocaleString("ja-JP", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—";

            // Q1-Q13 answers for this session
            const baseAnswers = (
              data.answersBySession[session.session_id] || []
            ).filter((a) => !a.is_followup);

            return (
              <div
                key={session.session_id}
                className="bg-white border border-border rounded-xl overflow-hidden"
              >
                {/* Session header (clickable) */}
                <button
                  type="button"
                  onClick={() => toggleSession(session.session_id)}
                  className="w-full px-5 py-3 flex items-center justify-between hover:bg-surface/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-sm text-text-secondary">
                      {dateStr}
                    </span>
                    <span className="text-xs text-text-muted">
                      関心度:{" "}
                      {session.interest_level
                        ? INTEREST_LABELS[String(session.interest_level)] ||
                          session.interest_level
                        : "—"}
                    </span>
                    <span className="text-xs text-text-muted">
                      {answeredCount}/{followups.length}問回答済
                    </span>
                    {/* Mini distribution bar */}
                    <div className="flex h-3 w-24 rounded overflow-hidden">
                      {LIKERT_OPTIONS.map((opt) => {
                        const count = followups.filter(
                          (f) => f.likert === opt.value,
                        ).length;
                        const pct =
                          followups.length > 0
                            ? (count / followups.length) * 100
                            : 0;
                        if (pct === 0) return null;
                        return (
                          <div
                            key={opt.value}
                            className={LIKERT_COLORS[opt.value]}
                            style={{ width: `${pct}%` }}
                            title={`${opt.label}: ${count}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <span className="text-text-muted text-sm shrink-0 ml-2">
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-border px-5 py-4 space-y-4">
                    {/* Q1-Q13 compact summary */}
                    {baseAnswers.length > 0 && (
                      <div className="bg-surface/50 rounded-lg p-3">
                        <p className="text-xs text-text-muted mb-2 font-medium">
                          Q1-Q{SURVEY_QUESTIONS.length} 回答
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {SURVEY_QUESTIONS.map((q, qi) => {
                            const ans = baseAnswers.find(
                              (a) => a.question_id === q.id,
                            );
                            const color = ans?.likert
                              ? LIKERT_COLORS[ans.likert] || "bg-gray-300"
                              : "bg-gray-200";
                            const label = ans?.likert
                              ? LIKERT_LABELS[ans.likert]
                              : "未回答";
                            const hasFreetext =
                              ans?.freetext && ans.freetext.trim();
                            return (
                              <div
                                key={q.id}
                                className="flex items-center gap-1 cursor-default"
                                onMouseEnter={(e) =>
                                  showTooltip(
                                    e,
                                    <div className="space-y-1">
                                      <p className="text-gray-400 text-[10px]">
                                        Q{qi + 1}
                                      </p>
                                      <p className="leading-relaxed">
                                        {q.text}
                                      </p>
                                      <p className="font-medium">{label}</p>
                                      {hasFreetext && (
                                        <p className="text-gray-300 border-t border-gray-700 pt-1 leading-relaxed">
                                          {ans.freetext}
                                        </p>
                                      )}
                                    </div>,
                                  )
                                }
                                onMouseLeave={hideTooltip}
                              >
                                <span className="text-[10px] text-text-muted w-5 text-right">
                                  {qi + 1}
                                </span>
                                <span
                                  className={`inline-block w-4 h-4 rounded-sm ${color}`}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Followup Q&A */}
                    {followups.map((f, idx) => (
                      <div
                        key={f.question_id}
                        className="bg-surface rounded-lg p-3"
                      >
                        <p className="text-xs text-text-muted mb-1">
                          Q{FOLLOWUP_START + idx}
                        </p>
                        <p className="text-sm text-text mb-2">{f.text}</p>
                        <div className="flex items-center gap-2">
                          {f.likert ? (
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs text-white ${LIKERT_COLORS[f.likert] || "bg-gray-400"}`}
                            >
                              {LIKERT_LABELS[f.likert] || f.likert}
                            </span>
                          ) : (
                            <span className="text-xs text-text-muted">
                              未回答
                            </span>
                          )}
                        </div>
                        {f.freetext && f.freetext.trim() && (
                          <p className="mt-2 text-sm text-text-secondary bg-white rounded p-2 leading-relaxed">
                            {f.freetext}
                          </p>
                        )}
                      </div>
                    ))}
                    {session.additional_comments &&
                      session.additional_comments.trim() && (
                        <div className="bg-surface rounded-lg p-3">
                          <p className="text-xs text-text-muted mb-1">
                            追加コメント
                          </p>
                          <p className="text-sm text-text-secondary leading-relaxed">
                            {session.additional_comments}
                          </p>
                        </div>
                      )}
                    <button
                      type="button"
                      onClick={() => jumpToResponse(session.session_id)}
                      className="text-xs text-accent hover:underline"
                    >
                      個別回答を見る →
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="bg-white border border-border rounded-xl p-4">
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className="text-2xl font-bold text-text">{value}</p>
    </div>
  );
}
