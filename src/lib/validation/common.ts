import { z } from "zod";

export const uuid = z.string().uuid();
export const httpsUrl = z
  .string()
  .trim()
  .url()
  .refine((u) => u.startsWith("https://"), "Must be an https:// URL");
export const httpUrl = z
  .string()
  .trim()
  .url()
  .refine((u) => /^https?:\/\//.test(u), "Must be an http(s) URL");
export const optionalUrl = z.union([httpUrl, z.literal("").transform(() => null), z.null()]).optional();
export const money = z.coerce.number().min(0).max(1_000_000);
export const optionalMoney = z.union([money, z.literal("").transform(() => null), z.null()]).optional();
export const shortText = (max: number) => z.string().trim().max(max);
export const keywordList = z
  .array(z.string().trim().min(1).max(80))
  .max(30)
  .transform((a) => [...new Set(a.map((k) => k.toLowerCase()))]);

export const STAGES = [
  "discovered",
  "researching",
  "selected_for_testing",
  "sample_ordered",
  "sample_received",
  "content_production",
  "testing",
  "promising",
  "scaling_consideration",
  "discontinued",
  "archived",
] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABELS: Record<Stage, string> = {
  discovered: "Discovered",
  researching: "Researching",
  selected_for_testing: "Selected for testing",
  sample_ordered: "Sample ordered",
  sample_received: "Sample received",
  content_production: "Content production",
  testing: "Testing",
  promising: "Promising",
  scaling_consideration: "Scaling consideration",
  discontinued: "Discontinued",
  archived: "Archived",
};
export const TESTING_STAGES: Stage[] = [
  "selected_for_testing",
  "sample_ordered",
  "sample_received",
  "content_production",
  "testing",
  "promising",
  "scaling_consideration",
];
