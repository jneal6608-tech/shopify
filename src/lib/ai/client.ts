import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import { AiUnavailableError } from "./errors";

let client: Anthropic | null = null;

export function aiConfigured(): boolean {
  return Boolean(env().ANTHROPIC_API_KEY);
}

export function getAnthropic(): Anthropic {
  const key = env().ANTHROPIC_API_KEY;
  if (!key) throw new AiUnavailableError("not_configured", "AI is not configured: set ANTHROPIC_API_KEY on the server. All non-AI features keep working.");
  if (!client) client = new Anthropic({ apiKey: key, maxRetries: 2, timeout: 10 * 60 * 1000 });
  return client;
}

/** Shared system preamble: honesty rules that apply to every AI feature. */
export const HONESTY_RULES = `You are the research analyst inside a dropshipping product-research platform used by a solo operator who sells through an umbrella Shopify store and markets ONLY with organic, faceless short-form video (TikTok, Instagram Reels, YouTube Shorts). They buy samples before marketing and want to find products before they become saturated.

Non-negotiable rules:
- Use ONLY the data provided in the request. Never invent market measurements, search volumes, view counts, sales figures, competitor revenue, ad counts, review counts or prices.
- If information is missing, say so explicitly and list it as missing. Missing data is a risk, never a positive.
- Label every claim's basis: "measured" (from an API or official export), "manual" (recorded by the user with a source), "estimate" (user or platform estimate), or "ai_interpretation" (your reasoning).
- Records marked is_demo / DEMO are synthetic; say that conclusions drawn from them are illustrative only.
- Scores and recommendations in the input were computed by deterministic formulas. Explain them; do not change or re-score them.
- Never suggest misleading claims, fake reviews, fabricated before/after results, or demonstrations that misrepresent the product.
- Be concise, specific and practical.`;
