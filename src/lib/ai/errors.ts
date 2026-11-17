export type AiErrorCode = "not_configured" | "budget_exceeded" | "refused" | "truncated" | "invalid_output" | "api_error" | "rate_limited";

export class AiUnavailableError extends Error {
  constructor(
    public code: AiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AiUnavailableError";
  }
}
