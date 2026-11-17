import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { thresholdsSchema } from "@/lib/validation/records";
import { audit } from "@/lib/services/audit";

const nullableNum = (min: number, max: number) => z.union([z.coerce.number().min(min).max(max), z.literal("").transform(() => null), z.null()]).optional();
const body = z.object({
  aiModel: z.enum(["claude-opus-5-5", "claude-sonnet-5-5"]).optional(),
  aiMonthlyBudgetUsd: nullableNum(0, 100000),
  testingBudgetUsd: nullableNum(0, 10_000_000),
  weeklyHours: nullableNum(0, 168),
  targetMarginPct: nullableNum(0, 100),
  maxSupplierCost: nullableNum(0, 100000),
  preferredCategoryIds: z.array(z.string().uuid()).max(50).optional(),
  avoidedKeywords: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
  alertThresholds: thresholdsSchema.optional(),
  feeSettings: z.object({
    paymentFeePct: z.number().min(0).max(20), paymentFixedFee: z.number().min(0).max(10), shopifyTxnFeePct: z.number().min(0).max(10),
    refundRatePct: z.number().min(0).max(90), otherVariablePerUnit: z.number().min(0).max(1000), fixedMonthlyCosts: z.number().min(0).max(100000),
  }).partial().optional(),
});

export const PATCH = apiHandler({ body }, async ({ db, user, body }) => {
  const cols = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  if (Object.keys(cols).length === 0) return { ok: true };
  const json = ["alertThresholds", "feeSettings"];
  const values = Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, json.includes(k) ? db.json(v as never) : v]));
  await db`update public.user_preferences set ${db(values as never)}`;
  await audit(db, user.id, "settings.preferences", "user_preferences", user.id, { fields: Object.keys(cols) });
  return { ok: true };
});
