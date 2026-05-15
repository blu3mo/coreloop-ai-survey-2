// ============================================================
// クラスタリング動作確認用のテストデータ投入スクリプト
// 30人ぶんの page_completed=2 セッション + Q1-Q13 + フォローアップ5問を生成
//
// 使い方:
//   pnpm seed:cluster
// 内部的には:
//   node --env-file=.env.development.local --import tsx scripts/seed-cluster-test-data.ts
//
// 冪等: user_agent='seed-script/...' のセッションを事前削除してから投入
//
// ペルソナ (4方向に尖らせて K=4 が見えやすいよう設計):
//   A: 規制強化派 (n=8)        — 企業も政府も強く規制すべき
//   B: 自由・個人責任派 (n=8)  — 教育で対処、企業義務・政府介入は反対
//   C: 折衷・教育推進派 (n=8)  — 教育を軸に、規制は穏当に、政府介入も支持
//   D: 政府不信・自主規制派 (n=6) — 企業の自主規制はOKだが政府介入は強く反対
//
// 各セッションに固定5問のフォローアップ (q14-q18) を付与。
// フォローアップの質問文はペルソナごとの「LLM生成相当」プールから抽選。
// ============================================================

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { LikertValue } from "../src/lib/survey-data";
import { SURVEY_QUESTIONS } from "../src/lib/survey-data";
import type { Database } from "../src/lib/database.types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です。\n" +
      "  node --env-file=.env.development.local --import tsx scripts/seed-cluster-test-data.ts",
  );
  process.exit(1);
}

const supabase = createClient<Database>(SUPABASE_URL, SERVICE_ROLE);

const QUESTION_IDS = SURVEY_QUESTIONS.map((q) => q.id);
const QUESTION_TEXT_BY_ID: Record<string, string> = Object.fromEntries(
  SURVEY_QUESTIONS.map((q) => [q.id, q.text]),
);

// リッカート選択肢ごとの重み配列
// [strongly_agree, agree, neutral, disagree, strongly_disagree, dont_know]
type WeightVector = readonly [number, number, number, number, number, number];

const W_VERY_PRO: WeightVector = [0.65, 0.3, 0.04, 0.01, 0.0, 0.0];
const W_VERY_CON: WeightVector = [0.0, 0.01, 0.04, 0.3, 0.65, 0.0];
const W_STRONG_PRO: WeightVector = [0.4, 0.45, 0.1, 0.04, 0.0, 0.01];
const W_STRONG_CON: WeightVector = [0.0, 0.04, 0.1, 0.45, 0.4, 0.01];
const W_MILD_PRO: WeightVector = [0.2, 0.5, 0.2, 0.08, 0.0, 0.02];
const W_MILD_CON: WeightVector = [0.0, 0.08, 0.2, 0.5, 0.2, 0.02];
const W_NEUTRAL: WeightVector = [0.05, 0.15, 0.55, 0.15, 0.05, 0.05];

const LIKERT_BY_INDEX: LikertValue[] = [
  "strongly_agree",
  "agree",
  "neutral",
  "disagree",
  "strongly_disagree",
  "dont_know",
];

interface Persona {
  n: number;
  weights: Record<string, WeightVector>;
  freetexts: Partial<Record<string, string[]>>;
  /** フォローアップ質問プール: AIが生成しそうな質問文を集めておき、5問ランダム抽選 */
  followupQuestionPool: string[];
  /** フォローアップ回答時のLikert重み (1つの分布で全フォローアップに適用) */
  followupWeights: WeightVector;
  /** フォローアップ用 freetext プール */
  followupFreetextPool: string[];
}

const PERSONAS: Record<string, Persona> = {
  A: {
    n: 8,
    weights: {
      q1: W_STRONG_PRO,
      q2: W_VERY_PRO,
      q3: W_NEUTRAL,
      q4: W_VERY_PRO,
      q5: W_VERY_PRO,
      q6: W_VERY_PRO,
      q7: W_VERY_PRO,
      q8: W_VERY_CON,
      q9: W_VERY_PRO,
      q10: W_VERY_PRO,
      q11: W_VERY_CON,
      q12: W_VERY_PRO,
      q13: W_VERY_PRO,
    },
    freetexts: {
      q2: ["詐欺の巧妙化に個人では限界がある", "社会全体で防ぐ仕組みが必要"],
      q6: [
        "広告で利益を得る企業は迅速対応が責務",
        "拡散の速さを考えると24時間以内必須",
      ],
      q11: [
        "詐欺は犯罪。規制は自由の侵害ではない",
        "被害者保護のための公正なルール",
      ],
    },
    followupQuestionPool: [
      "国際的に統一された詐欺広告規制の枠組みを日本が主導すべきだと思いますか？",
      "違反事業者の役員にも個人責任を問う制度が必要だと思いますか？",
      "詐欺広告の被害者に対する公的補償制度を国が設けるべきだと思いますか？",
      "削除義務に違反した広告プラットフォームに対し、課徴金を売上の数%として課すべきだと思いますか？",
      "公的な広告主データベースに本人確認情報を登録することを義務化すべきだと思いますか？",
      "規制違反企業の役員に対し、一定期間の業界活動を禁止する制裁が必要だと思いますか？",
      "プラットフォームの広告審査プロセスを第三者監査の対象にすべきだと思いますか？",
    ],
    followupWeights: W_STRONG_PRO,
    followupFreetextPool: [
      "迅速で実効的な対応のためには強い罰則が必要だと考える。",
      "被害者保護を最優先にすべきで、企業側の負担はやむを得ない。",
      "他国の先行事例を参考に、日本も毅然と取り組むべき。",
    ],
  },
  B: {
    n: 8,
    weights: {
      q1: W_NEUTRAL,
      q2: W_MILD_CON,
      q3: W_VERY_PRO,
      q4: W_VERY_CON,
      q5: W_STRONG_CON,
      q6: W_STRONG_CON,
      q7: W_VERY_CON,
      q8: W_VERY_PRO,
      q9: W_VERY_CON,
      q10: W_VERY_CON,
      q11: W_VERY_PRO,
      q12: W_VERY_CON,
      q13: W_VERY_CON,
    },
    freetexts: {
      q3: [
        "個人のリテラシーを上げることが本質的な解決",
        "教育で対処すべき領域",
      ],
      q8: [
        "民間の柔軟性を活かす方が効率的",
        "技術変化が速いので自主規制が現実的",
      ],
      q11: ["過度な規制は表現の自由を損なう", "創意工夫が阻害される懸念"],
      q13: ["数値目標は副作用を生む", "柔軟な対応が現実的"],
    },
    followupQuestionPool: [
      "規制よりもプラットフォーム間の競争による品質向上のほうが効果的だと思いますか？",
      "AI技術の進化を阻害しない範囲で対策を進めるべきだと思いますか？",
      "ユーザー側のオプトアウト機能を充実させる方が、削除義務化より望ましいと思いますか？",
      "規制の対象を中小事業者にまで広げると、新規参入の障害になると思いますか？",
      "海外プラットフォームに国内法を強制適用しても実効性は乏しいと思いますか？",
      "規制の運用は時の政権の意向に左右されるリスクが高いと思いますか？",
      "民間の認証制度を充実させることで、政府介入を最小化すべきだと思いますか？",
    ],
    followupWeights: W_MILD_PRO,
    followupFreetextPool: [
      "規制よりも市場の自浄作用に期待したい。",
      "技術革新の自由度を守ることが長期的には消費者の利益にもなる。",
      "国境を越える広告に国内法を当てはめても限界がある。",
    ],
  },
  C: {
    n: 8,
    weights: {
      q1: W_STRONG_PRO,
      q2: W_STRONG_PRO,
      q3: W_VERY_PRO,
      q4: W_MILD_PRO,
      q5: W_STRONG_PRO,
      q6: W_MILD_PRO,
      q7: W_NEUTRAL,
      q8: W_STRONG_PRO,
      q9: W_NEUTRAL,
      q10: W_NEUTRAL,
      q11: W_NEUTRAL,
      q12: W_STRONG_PRO,
      q13: W_NEUTRAL,
    },
    freetexts: {
      q3: [
        "詐欺を見抜く力を養う教育が最重要",
        "規制だけでは限界、判断力が鍵",
      ],
      q5: [
        "ラベルの意味を理解する教育が必要",
        "情報リテラシーがあって初めて機能する",
      ],
      q8: [
        "企業の自主的な改善と教育を組み合わせるのが現実的",
      ],
    },
    followupQuestionPool: [
      "学校教育の中に情報リテラシーの専門科目を設けるべきだと思いますか？",
      "高齢者向けの詐欺被害防止講座を自治体が定期的に提供すべきだと思いますか？",
      "プラットフォーム上で詐欺広告の見抜き方を案内するチュートリアル機能が有効だと思いますか？",
      "詐欺事例をオープンデータとして共有することで国民の警戒心を高められると思いますか？",
      "金融機関の窓口での教育・声かけが詐欺被害の抑止に有効だと思いますか？",
      "AIが学習教材として詐欺事例をシミュレーションする取り組みが必要だと思いますか？",
      "地域コミュニティでの相互啓発が効果的だと思いますか？",
    ],
    followupWeights: W_VERY_PRO,
    followupFreetextPool: [
      "規制だけでは穴ができるので、人の判断力を上げることが本質的解決になる。",
      "技術的対策と教育を両輪で進めることが望ましい。",
      "世代別に必要な教育内容は異なるので、的を絞った設計が必要。",
    ],
  },
  D: {
    n: 6,
    weights: {
      q1: W_NEUTRAL,
      q2: W_MILD_PRO,
      q3: W_STRONG_PRO,
      q4: W_STRONG_PRO,
      q5: W_STRONG_PRO,
      q6: W_STRONG_PRO,
      q7: W_NEUTRAL,
      q8: W_VERY_PRO,
      q9: W_VERY_CON,
      q10: W_MILD_CON,
      q11: W_STRONG_PRO,
      q12: W_VERY_CON,
      q13: W_MILD_CON,
    },
    freetexts: {
      q8: [
        "企業が自主的に対策する仕組みを成熟させるべき",
        "民間主導の枠組みが望ましい",
      ],
      q9: ["政府の介入はやり過ぎ", "法規制は最終手段にすべき"],
      q12: [
        "政府主導のシステムは恣意的運用のリスクがある",
        "公的システムよりも民間の通報ハブの方が現実的",
      ],
    },
    followupQuestionPool: [
      "詐欺広告対策の優先順位は他の社会課題と比べて高いと思いますか？",
      "詐欺被害の統計データを政府が定期公表すべきだと思いますか？",
      "対策の効果を客観的に測定する仕組みが必要だと思いますか？",
      "詐欺広告の通報窓口を一本化することは現実的だと思いますか？",
      "個人情報保護と詐欺対策の両立は可能だと思いますか？",
      "海外との情報共有がどの程度進めば効果が出ると思いますか？",
      "詐欺対策に充てる予算規模はどの程度が妥当だと思いますか？",
    ],
    followupWeights: W_VERY_CON,
    followupFreetextPool: [
      "現状の情報が少なすぎて判断が難しい。",
      "もう少し具体的な事例が見えれば賛否を決められる気がする。",
      "専門家の議論をもっと聞いてみたい。",
    ],
  },
};

function pickWeighted(weights: WeightVector): LikertValue {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (r < acc) return LIKERT_BY_INDEX[i];
  }
  return LIKERT_BY_INDEX[LIKERT_BY_INDEX.length - 1];
}

function pickFreetext(persona: Persona, qid: string): string {
  const choices = persona.freetexts[qid];
  if (!choices || choices.length === 0) return "";
  if (Math.random() < 0.3) return "";
  return choices[Math.floor(Math.random() * choices.length)];
}

function pickFollowupFreetext(persona: Persona): string {
  if (Math.random() < 0.2) return "";
  const pool = persona.followupFreetextPool;
  return pool[Math.floor(Math.random() * pool.length)];
}

function sampleFollowupQuestions(persona: Persona, count: number): string[] {
  const pool = [...persona.followupQuestionPool];
  const picked: string[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picked;
}

const FOLLOWUP_COUNT = 5;
const FOLLOWUP_ID_START = SURVEY_QUESTIONS.length + 1; // q14

const USER_AGENT_PREFIX = "seed-script/";

async function clearExistingSeeds(): Promise<void> {
  // user_agent が seed-script/ で始まる sessions を削除（answers は ON DELETE CASCADE で同時に消える）
  const { data, error } = await supabase
    .from("sessions")
    .select("session_id")
    .like("user_agent", `${USER_AGENT_PREFIX}%`);
  if (error) throw new Error(`既存seed取得エラー: ${error.message}`);
  if (!data || data.length === 0) return;
  console.log(`Clearing ${data.length} existing seed sessions...`);
  const ids = data.map((r) => r.session_id);
  const { error: dErr } = await supabase
    .from("sessions")
    .delete()
    .in("session_id", ids);
  if (dErr) throw new Error(`既存seed削除エラー: ${dErr.message}`);
}

async function main(): Promise<void> {
  console.log("Seeding cluster test data...");
  await clearExistingSeeds();

  const sessions: Database["public"]["Tables"]["sessions"]["Insert"][] = [];
  const answers: Database["public"]["Tables"]["answers"]["Insert"][] = [];

  for (const [name, persona] of Object.entries(PERSONAS)) {
    for (let i = 0; i < persona.n; i++) {
      const sessionId = randomUUID();
      sessions.push({
        session_id: sessionId,
        interest_level: 3 + Math.floor(Math.random() * 2),
        interest_reasons: ["news_media"],
        page_completed: 2,
        user_agent: `${USER_AGENT_PREFIX}persona-${name}`,
        completed_at: new Date().toISOString(),
      });
      for (const qid of QUESTION_IDS) {
        const weights = persona.weights[qid];
        if (!weights) continue;
        answers.push({
          session_id: sessionId,
          question_id: qid,
          question_text: QUESTION_TEXT_BY_ID[qid] ?? "",
          likert: pickWeighted(weights),
          freetext: pickFreetext(persona, qid),
          is_followup: false,
        });
      }

      // フォローアップ5問
      const followupQuestions = sampleFollowupQuestions(persona, FOLLOWUP_COUNT);
      for (let f = 0; f < followupQuestions.length; f++) {
        const qid = `q${FOLLOWUP_ID_START + f}`;
        answers.push({
          session_id: sessionId,
          question_id: qid,
          question_text: followupQuestions[f],
          likert: pickWeighted(persona.followupWeights),
          freetext: pickFollowupFreetext(persona),
          is_followup: true,
        });
      }
    }
  }

  console.log(
    `Inserting ${sessions.length} sessions, ${answers.length} answers...`,
  );

  const { error: sErr } = await supabase.from("sessions").insert(sessions);
  if (sErr) throw new Error(`sessions insert failed: ${sErr.message}`);

  const CHUNK = 200;
  for (let i = 0; i < answers.length; i += CHUNK) {
    const slice = answers.slice(i, i + CHUNK);
    const { error: aErr } = await supabase.from("answers").insert(slice);
    if (aErr) {
      throw new Error(
        `answers insert failed at offset ${i}: ${aErr.message}`,
      );
    }
  }

  console.log(`✅ Done. ${sessions.length} sessions seeded.`);
  console.log(
    "Run /admin → クラスター分析タブ → 「再計算」 to test the pipeline.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
