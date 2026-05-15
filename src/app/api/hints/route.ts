import { type NextRequest, NextResponse } from "next/server";
import { callOpenRouter } from "@/lib/openrouter";
import {
  FOLLOWUP_HINT_SYSTEM_PROMPT,
  HINT_USER_MESSAGE_TEMPLATE,
  LIKERT_OPTIONS,
  SURVEY_QUESTIONS,
} from "@/lib/survey-data";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      questionId,
      questionText,
      likertAnswer,
      currentText,
      previousAnswers,
    }: {
      questionId: string;
      questionText?: string;
      likertAnswer: string;
      currentText: string;
      previousAnswers: Record<string, { likert: string; freetext: string }>;
    } = body;

    // Find system prompt: use question-specific one for base questions, generic for followups
    const baseQuestion = SURVEY_QUESTIONS.find((q) => q.id === questionId);
    let systemPrompt: string;

    if (baseQuestion) {
      systemPrompt = baseQuestion.hintSystemPrompt;
    } else {
      // Followup question — use generic prompt with the question text
      const qText = questionText || "（質問文なし）";
      systemPrompt = FOLLOWUP_HINT_SYSTEM_PROMPT.replace(
        "{{QUESTION_TEXT}}",
        qText,
      );
    }

    // Format previous answers for context
    const prevAnswersFormatted = Object.entries(previousAnswers || {})
      .map(([qId, ans]) => {
        const likertLabel =
          LIKERT_OPTIONS.find((o) => o.value === ans.likert)?.label ||
          ans.likert;
        return `${qId.toUpperCase()}: ${likertLabel}${ans.freetext ? ` - "${ans.freetext}"` : ""}`;
      })
      .join("\n");

    const likertLabel =
      LIKERT_OPTIONS.find((o) => o.value === likertAnswer)?.label ||
      likertAnswer ||
      "未回答";

    const userMessage = HINT_USER_MESSAGE_TEMPLATE.replace(
      "{{LIKERT_LABEL}}",
      likertLabel,
    )
      .replace(
        "{{PREVIOUS_ANSWERS}}",
        prevAnswersFormatted || "（まだ他の設問には回答していません）",
      )
      .replace("{{CURRENT_TEXT}}", currentText || "（まだ何も書いていません）");

    const hint = await callOpenRouter(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      { maxTokens: 256, temperature: 0.7 },
    );

    return NextResponse.json({ hint });
  } catch (error) {
    console.error("Hint generation error:", error);
    return NextResponse.json(
      { error: "ヒントの生成中にエラーが発生しました。" },
      { status: 500 },
    );
  }
}
