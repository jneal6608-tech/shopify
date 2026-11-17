import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { withUser } from "../db";
import { logger } from "../logger";
import { getAnthropic, HONESTY_RULES } from "./client";
import { AiUnavailableError } from "./errors";
import { DEFAULT_MODEL, estimateCostUsd, SELECTABLE_MODELS, type SelectableModel, type TokenUsage } from "./models";

export interface AiRunMeta {
  model: string;
  requestedModel: string;
  usage: TokenUsage;
  costUsd: number;
}

export async function userModel(userId: string): Promise<SelectableModel> {
  const [p] = await withUser(userId, (db) => db<{ aiModel: string }[]>`select ai_model from public.user_preferences`);
  return p && p.aiModel in SELECTABLE_MODELS ? (p.aiModel as SelectableModel) : DEFAULT_MODEL;
}

export async function monthToDateSpend(userId: string): Promise<{ spent: number; budget: number | null }> {
  return withUser(userId, async (db) => {
    const [s] = await db<{ spent: number }[]>`
      select coalesce(sum(cost_usd), 0)::numeric as spent from public.ai_usage
      where created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'`;
    const [p] = await db<{ aiMonthlyBudgetUsd: number | null }[]>`select ai_monthly_budget_usd from public.user_preferences`;
    return { spent: Number(s.spent), budget: p?.aiMonthlyBudgetUsd ?? null };
  });
}

async function checkBudget(userId: string) {
  const { spent, budget } = await monthToDateSpend(userId);
  if (budget !== null && spent >= budget) {
    throw new AiUnavailableError(
      "budget_exceeded",
      `Monthly AI budget reached ($${spent.toFixed(2)} of $${budget.toFixed(2)}). Raise it in Settings or wait until next month.`,
    );
  }
}

export async function recordUsage(userId: string, feature: string, model: string, usage: TokenUsage) {
  const cost = estimateCostUsd(model, usage);
  await withUser(userId, (db) => db`
    insert into public.ai_usage (user_id, feature, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
    values (${userId}, ${feature}, ${model}, ${usage.inputTokens}, ${usage.outputTokens}, ${usage.cacheReadTokens}, ${usage.cacheWriteTokens}, ${cost})`);
  return cost;
}

export function usageFrom(u: Anthropic.Beta.BetaUsage | undefined): TokenUsage {
  return {
    inputTokens: u?.input_tokens ?? 0,
    outputTokens: u?.output_tokens ?? 0,
    cacheReadTokens: u?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u?.cache_creation_input_tokens ?? 0,
  };
}

export function mapApiError(err: unknown): never {
  if (err instanceof AiUnavailableError) throw err;
  if (err instanceof Anthropic.RateLimitError) throw new AiUnavailableError("rate_limited", "The AI provider is rate limiting requests. Try again in a minute.");
  if (err instanceof Anthropic.AuthenticationError) throw new AiUnavailableError("not_configured", "The ANTHROPIC_API_KEY was rejected. Check the key in your server environment.");
  if (err instanceof Anthropic.BadRequestError) {
    logger.error("ai.bad_request", { err });
    throw new AiUnavailableError("api_error", `The AI request was rejected: ${err.message}`);
  }
  if (err instanceof Anthropic.APIError) throw new AiUnavailableError("api_error", `AI provider error (${err.status ?? "network"}). Try again shortly.`);
  if (err instanceof Anthropic.AnthropicError && /parse structured output/i.test(err.message))
    throw new AiUnavailableError("invalid_output", "The AI returned output that did not match the expected structure. Try again.");
  throw err;
}

/**
 * Runs one structured-output request. The model returns JSON validated
 * against `schema`. Uses streaming so long outputs never hit HTTP timeouts,
 * and server-side refusal fallbacks so a policy decline is retried on the
 * server-defined fallback model. Never holds a DB transaction during the call.
 */
export async function runStructured<S extends z.ZodType>(
  userId: string,
  opts: {
    feature: string;
    instructions: string;
    input: unknown;
    schema: S;
    maxTokens?: number;
    effort?: "low" | "medium" | "high";
  },
): Promise<{ data: z.infer<S>; meta: AiRunMeta }> {
  const client = getAnthropic();
  await checkBudget(userId);
  const model = await userModel(userId);
  let message;
  try {
    const stream = client.beta.messages.stream({
      model,
      max_tokens: opts.maxTokens ?? 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: HONESTY_RULES }, { type: "text", text: opts.instructions }],
      messages: [
        {
          role: "user",
          content: `Platform data for this request (JSON):\n\n${JSON.stringify(opts.input, null, 1)}`,
        },
      ],
      output_config: { format: betaZodOutputFormat(opts.schema), effort: opts.effort ?? "medium" },
    });
    message = await stream.finalMessage();
  } catch (err) {
    mapApiError(err);
  }
  const usage = usageFrom(message.usage);
  const servedModel = message.model ?? model;
  const costUsd = await recordUsage(userId, opts.feature, servedModel, usage);
  if (message.stop_reason === "refusal") {
    throw new AiUnavailableError("refused", "The AI declined this request. Rephrase the inputs and try again.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new AiUnavailableError("truncated", "The AI response was cut off before completing. Try again.");
  }
  const parsed = message.parsed_output as z.infer<S> | null | undefined;
  if (parsed === null || parsed === undefined) {
    throw new AiUnavailableError("invalid_output", "The AI returned output that did not match the expected structure. Try again.");
  }
  logger.info("ai.run", { feature: opts.feature, model: servedModel, costUsd, ...usage });
  return { data: parsed, meta: { model: servedModel, requestedModel: model, usage, costUsd } };
}
