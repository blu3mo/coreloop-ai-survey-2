import { getCachedResponse, setCachedResponse } from "./llm-cache";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_EMBEDDING_URL = "https://openrouter.ai/api/v1/embeddings";
const MODEL = "google/gemini-3-flash-preview";
export const EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const EMBEDDING_DIM = 1536;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function callOpenRouter(
  messages: ChatMessage[],
  options?: {
    maxTokens?: number;
    temperature?: number;
    skipCache?: boolean;
  },
): Promise<string> {
  const maxTokens = options?.maxTokens ?? 1024;
  const temperature = options?.temperature ?? 0.7;

  // Check cache first (unless explicitly skipped)
  if (!options?.skipCache) {
    const cached = await getCachedResponse(
      messages,
      MODEL,
      maxTokens,
      temperature,
    );
    if (cached !== null) {
      return cached;
    }
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        "https://citizen-survey.vercel.app",
      "X-Title": "Citizen Survey",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? "";

  // Store in cache (fire-and-forget)
  if (!options?.skipCache) {
    setCachedResponse(messages, MODEL, maxTokens, temperature, content).catch(
      () => {},
    );
  }

  return content;
}

// Model info for transparency page
export const MODEL_INFO = {
  id: MODEL,
  name: "Gemini 3 Flash Preview",
  provider: "Google (via OpenRouter)",
  description:
    "Google の Gemini 3 Flash Preview モデルを OpenRouter 経由で使用しています。回答のヒント生成と、フォローアップ質問の生成に使用されます。",
};

/**
 * OpenRouter経由で embedding を取得する（OpenAI互換 /v1/embeddings エンドポイント）。
 */
export async function callOpenRouterEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const response = await fetch(OPENROUTER_EMBEDDING_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        "https://citizen-survey.vercel.app",
      "X-Title": "Citizen Survey",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenRouter embedding error (${response.status}): ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    data?: Array<{ embedding: number[] }>;
  };
  const emb = data.data?.[0]?.embedding;
  if (!emb || emb.length !== EMBEDDING_DIM) {
    throw new Error(
      `Unexpected embedding response shape (dim=${emb?.length ?? "missing"})`,
    );
  }
  return emb;
}
