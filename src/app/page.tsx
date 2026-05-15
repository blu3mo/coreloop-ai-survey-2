"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import CompletePage from "@/components/CompletePage";
import FraudEducationCarousel from "@/components/FraudEducationCarousel";
import SurveyPage1 from "@/components/SurveyPage1";
import SurveyPage2 from "@/components/SurveyPage2";
import { Title, Typography } from "@/components/Typography";
import { SURVEY_INTRO } from "@/lib/survey-data";

type SurveyState = "loading" | "intro" | "page1" | "page2" | "complete";

export default function Home() {
  const [state, setState] = useState<SurveyState>("loading");
  const [sessionId, setSessionId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [page1Data, setPage1Data] = useState<{
    interestLevel: number;
    interestReasons: string[];
    interestOtherText: string;
    answers: Record<string, { likert: string; freetext: string }>;
  } | null>(null);
  const [initialPage1Answers, setInitialPage1Answers] = useState<
    Record<string, { likert: string; freetext: string }> | undefined
  >();
  const [initialPage2Answers, setInitialPage2Answers] = useState<
    Record<string, { likert: string; freetext: string }> | undefined
  >();
  const [initialInterest, setInitialInterest] = useState<
    | {
        level: number | null;
        reasons: string[];
        otherText: string;
      }
    | undefined
  >();
  const [error, setError] = useState<string | null>(null);
  const [isStuck, setIsStuck] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Intersection observer for sticky button
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsStuck(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Session restore on mount
  useEffect(() => {
    const restore = async () => {
      let sid = localStorage.getItem("survey_session_id");
      if (!sid) {
        sid = uuidv4();
        localStorage.setItem("survey_session_id", sid);
      }
      setSessionId(sid);

      // Try to restore from DB
      try {
        const res = await fetch(
          `/api/session?sessionId=${encodeURIComponent(sid)}`,
        );
        if (res.ok) {
          const { session, answers } = await res.json();

          if (session?.page_completed === 2) {
            setState("complete");
            return;
          }

          if (session && session.page_completed !== 2) {
            const page1Answers: Record<
              string,
              { likert: string; freetext: string }
            > = {};
            const page2Answers: Record<
              string,
              { likert: string; freetext: string }
            > = {};

            for (const a of answers || []) {
              const entry = {
                likert: a.likert || "",
                freetext: a.freetext || "",
              };
              if (a.is_followup) {
                page2Answers[a.question_id] = entry;
              } else {
                page1Answers[a.question_id] = entry;
              }
            }

            if (session.page_completed === 1) {
              setPage1Data({
                interestLevel: session.interest_level || 0,
                interestReasons: session.interest_reasons || [],
                interestOtherText: session.interest_other_text || "",
                answers: page1Answers,
              });
              if (Object.keys(page2Answers).length > 0) {
                setInitialPage2Answers(page2Answers);
              }
              setState("page2");
              return;
            }

            // page_completed === 0: session exists, user has already started
            // Restore to page1 with any partial data (interest level, answers)
            setInitialInterest({
              level: session.interest_level,
              reasons: session.interest_reasons || [],
              otherText: session.interest_other_text || "",
            });
            setInitialPage1Answers(
              Object.keys(page1Answers).length > 0 ? page1Answers : undefined,
            );
            setState("page1");
            return;
          }
          // no session: show intro
        }
      } catch (err) {
        console.error("Session restore error:", err);
      }

      setState("intro");
    };

    restore();
  }, []);

  // Auto-save function
  const autoSaveAnswer = useCallback(
    (
      questionId: string,
      data: {
        likert?: string;
        freetext?: string;
        questionText?: string;
        isFollowup?: boolean;
      },
    ) => {
      if (!sessionId) return;

      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      autoSaveTimerRef.current = setTimeout(async () => {
        try {
          await fetch("/api/save-answer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              questionId,
              ...data,
            }),
          });
        } catch (err) {
          console.error("Auto-save error:", err);
        }
      }, 1000);
    },
    [sessionId],
  );

  // Auto-save interest data to session
  const autoSaveSession = useCallback(
    (data: {
      interestLevel?: number;
      interestReasons?: string[];
      interestOtherText?: string;
    }) => {
      if (!sessionId) return;

      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      autoSaveTimerRef.current = setTimeout(async () => {
        try {
          await fetch("/api/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              ...data,
            }),
          });
        } catch (err) {
          console.error("Auto-save session error:", err);
        }
      }, 1000);
    },
    [sessionId],
  );

  const handleStartSurvey = async () => {
    // Check if already completed
    try {
      const res = await fetch(
        `/api/session?sessionId=${encodeURIComponent(sessionId)}`,
      );
      if (res.ok) {
        const { session } = await res.json();
        if (session?.page_completed === 2) {
          setState("complete");
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
      }
    } catch (err) {
      console.error("Session check error:", err);
    }

    setState("page1");
    window.scrollTo({ top: 0, behavior: "smooth" });

    // Create session in DB if new
    try {
      await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          userAgent: navigator.userAgent,
        }),
      });
    } catch (err) {
      console.error("Session create error:", err);
    }
  };

  const handlePage1Submit = async (data: {
    interestLevel: number;
    interestReasons: string[];
    interestOtherText: string;
    answers: Record<string, { likert: string; freetext: string }>;
  }) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          page: 1,
          data: {
            ...data,
            userAgent: navigator.userAgent,
          },
        }),
      });

      if (!response.ok) throw new Error("Failed to submit page 1");

      setPage1Data(data);
      setState("page2");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error("Submit error:", err);
      setError("回答の送信に失敗しました。もう一度お試しください。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePage2Submit = async (data: {
    followupQuestions: { id: string; text: string }[];
    followupAnswers: Record<string, { likert: string; freetext: string }>;
    additionalComments: string;
  }) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          page: 2,
          data,
        }),
      });

      if (!response.ok) throw new Error("Failed to submit page 2");

      setState("complete");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error("Submit error:", err);
      setError("回答の送信に失敗しました。もう一度お試しください。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <h1 className="text-base font-bold text-primary leading-tight">
            {SURVEY_INTRO.title}
          </h1>
          {(state === "page1" || state === "page2") && (
            <Typography
              size="small"
              muted
              className="bg-surface px-2.5 py-1 rounded-full"
            >
              {state === "page1" ? "1" : "2"} / 2 ページ
            </Typography>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 sm:py-8 flex-1">
        {/* Loading */}
        {state === "loading" && (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="w-8 h-8 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start justify-between gap-3">
            <Typography as="p" size="regular" className="text-red-700">
              {error}
            </Typography>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600 shrink-0"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Intro */}
        {state === "intro" && (
          <div className="space-y-8 py-4">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-text">
                {SURVEY_INTRO.subtitle}
              </h2>
              <Typography as="p" size="regular" secondary>
                {SURVEY_INTRO.estimatedTime}
              </Typography>
            </div>

            <FraudEducationCarousel />

            <div className="bg-white border border-border rounded-2xl p-6 space-y-4">
              <Typography
                as="div"
                size="regular"
                secondary
                className="whitespace-pre-line"
              >
                {SURVEY_INTRO.description}
              </Typography>
              <hr className="border-border" />
              <div className="space-y-2">
                <div className="flex items-start gap-2.5">
                  <svg
                    className="w-4 h-4 text-text-secondary shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                  <Typography as="p" size="regular" secondary>
                    {SURVEY_INTRO.privacyNote}
                  </Typography>
                </div>
                <div className="flex items-start gap-2.5">
                  <svg
                    className="w-4 h-4 text-text-secondary shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                  <Typography as="p" size="regular" secondary>
                    {SURVEY_INTRO.aiNote}
                  </Typography>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Page 1 */}
        {state === "page1" && (
          <SurveyPage1
            onSubmit={handlePage1Submit}
            isSubmitting={isSubmitting}
            onAnswerChange={autoSaveAnswer}
            onInterestChange={autoSaveSession}
            initialAnswers={initialPage1Answers}
            initialInterest={initialInterest}
          />
        )}

        {/* Page 2 */}
        {state === "page2" && page1Data && (
          <SurveyPage2
            page1Answers={page1Data.answers}
            onSubmit={handlePage2Submit}
            isSubmitting={isSubmitting}
            initialAnswers={initialPage2Answers}
            onAnswerChange={autoSaveAnswer}
          />
        )}

        {/* Complete */}
        {state === "complete" && <CompletePage />}
      </main>

      {/* Sticky start button for intro */}
      {state === "intro" && (
        <>
          <div ref={sentinelRef} className="h-0" />
          <div
            className={`sticky bottom-0 z-10 py-3 px-4 backdrop-blur-sm transition-colors duration-300 ${
              isStuck ? "bg-white/90" : "bg-transparent"
            }`}
          >
            <div className="max-w-2xl mx-auto flex justify-center">
              <button
                type="button"
                onClick={handleStartSurvey}
                className="w-full sm:w-auto px-10 py-4 bg-primary text-white rounded-xl text-lg font-bold hover:bg-primary-light transition-all shadow-lg hover:shadow-xl active:scale-[0.98] ring-2 ring-primary/30 ring-offset-2"
              >
                調査を始める
              </button>
            </div>
          </div>
        </>
      )}

      {/* Footer */}
      <footer className="border-t border-border bg-white mt-12 py-5">
        <div className="max-w-2xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-text-muted">
          <a
            href="https://coreloop.dd2030.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-accent underline underline-offset-2"
          >
            Project Coreloop
          </a>
          <Link
            href="/transparency"
            className="hover:text-accent underline underline-offset-2"
          >
            AIの使用について
          </Link>
        </div>
      </footer>
    </div>
  );
}
