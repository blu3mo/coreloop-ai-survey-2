// ============================================================
// リッカート尺度 ⇄ 数値スコア変換
// Issue #26 共通ユーティリティ
// ============================================================

export const LIKERT_TO_NUMERIC: Record<string, number | null> = {
  strongly_agree: 2,
  agree: 1,
  neutral: 0,
  disagree: -1,
  strongly_disagree: -2,
  dont_know: null,
};

export function numericFromLikert(
  value: string | null | undefined,
): number | null {
  if (!value) return null;
  if (!(value in LIKERT_TO_NUMERIC)) return null;
  return LIKERT_TO_NUMERIC[value];
}
