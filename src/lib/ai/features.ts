import "server-only";
import { withUser } from "../db";
import { productBundle } from "../services/bundle";
import { getProductsByIds } from "../services/products";
import { runStructured } from "./run";
import {
  comparisonSchema,
  competitorAnalysisSchema,
  contentAssessmentSchema,
  contentPackSchema,
  contentPatternSchema,
  evaluationSchema,
  validationNarrativeSchema,
} from "./schemas";
import { FACELESS_FORMATS } from "../analytics/rubrics";
import { badRequest } from "../api/errors";

async function saveReport(userId: string, productId: string | null, kind: string, title: string, model: string, input: unknown, output: unknown, isDemo: boolean) {
  return withUser(userId, async (db) => {
    const [r] = await db<{ id: string }[]>`
      insert into public.research_reports (user_id, product_id, kind, title, model, input_snapshot, output, is_demo)
      values (${userId}, ${productId}, ${kind}, ${title}, ${model}, ${db.json(input as never)}, ${db.json(output as never)}, ${isDemo})
      returning id`;
    return r.id;
  });
}

// ---------------------------------------------------------------------------
export async function generateEvaluation(userId: string, productId: string) {
  const bundle = await withUser(userId, (db) => productBundle(db, productId));
  if (!bundle.deterministicScore) throw badRequest("Score the product before requesting an AI evaluation.");
  const { data, meta } = await runStructured(userId, {
    feature: "product_evaluation",
    schema: evaluationSchema,
    effort: "medium",
    instructions: `Write a product research evaluation. The opportunity score, confidence and recommendation were computed by transparent formulas — explain them in plain language, highlight the evidence behind them, and be explicit about what is missing. Evaluate fit for faceless organic short-form marketing specifically. Every evidence item must cite one of the provided records.`,
    input: bundle,
  });
  const id = await saveReport(userId, productId, "product_evaluation", `AI evaluation: ${bundle.product.name}`, meta.model, { scoreComputedAt: bundle.deterministicScore.computedAt }, data, bundle.product.is_demo);
  return { id, data, meta };
}

// ---------------------------------------------------------------------------
export async function suggestAssessments(userId: string, productId: string) {
  const bundle = await withUser(userId, (db) => productBundle(db, productId));
  const { data, meta } = await runStructured(userId, {
    feature: "content_assessment",
    schema: contentAssessmentSchema,
    effort: "low",
    instructions: `Suggest rubric ratings for this product. These are clearly labelled AI estimates the operator will review.
Faceless formats (rate 0–3 each): ${FACELESS_FORMATS.map((f) => `${f.key} = ${f.label}`).join("; ")}.
Rate on whether a hands-only/product-only vertical video in that format can show the product's value truthfully and grab attention in the first second. Be conservative: 3 only when the format is clearly excellent.
Problem: severity, frequency, clarity of the problem solved (0–5). Longevity: evergreen need (0 fad … 5 permanent) and repeat purchase (0–5).`,
    input: { product: bundle.product, competitors: bundle.competitors, referenceVideos: bundle.referenceVideos },
  });
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(v)));
  const content = Object.fromEntries(Object.entries(data.contentRatings).map(([k, v]) => [k, clamp(v, 3)]));
  await withUser(userId, async (db) => {
    await db`insert into public.product_assessments (user_id, product_id, kind, ratings, assessed_by, notes) values
      (${userId}, ${productId}, 'content', ${db.json(content)}, 'ai', ${data.contentRationale.slice(0, 4000)}),
      (${userId}, ${productId}, 'problem', ${db.json({ severity: clamp(data.problem.severity, 5), frequency: clamp(data.problem.frequency, 5), clarity: clamp(data.problem.clarity, 5) })}, 'ai', ${data.problem.rationale.slice(0, 4000)}),
      (${userId}, ${productId}, 'longevity', ${db.json({ evergreen: clamp(data.longevity.evergreen, 5), repeatPurchase: clamp(data.longevity.repeatPurchase, 5) })}, 'ai', ${data.longevity.rationale.slice(0, 4000)})`;
  });
  return { meta };
}

// ---------------------------------------------------------------------------
export async function generateContentPack(userId: string, productId: string) {
  const { bundle, learnings } = await withUser(userId, async (db) => ({
    bundle: await productBundle(db, productId),
    // Real results from the operator's own tests inform hooks and formats.
    learnings: await db`
      select v.format, v.hook, v.platform, max(p.views) as views, max(p.link_clicks) as link_clicks,
             max(p.likes + p.comments + p.shares + p.saves) as engagements
      from public.published_videos v join public.video_performance p on p.video_id = v.id
      where not v.is_demo
      group by v.id order by max(p.link_clicks) desc nulls last limit 15`,
  }));
  const { data, meta } = await runStructured(userId, {
    feature: "content_pack",
    schema: contentPackSchema,
    effort: "medium",
    maxTokens: 48000,
    instructions: `Create an organic, FACELESS short-form content pack (vertical 9:16) for TikTok, Instagram Reels and YouTube Shorts. No one appears on camera: only hands, the product, environments, screen text and voiceover.
Deliver exactly 10 concepts, 10 opening hooks and 5 complete scripts with shot-by-shot instructions, on-screen text, editing style, voiceover, caption, call to action, hashtags and duration.
Prioritise: an attention-grabbing first second, strong visual demonstration, clear story, curiosity, demonstrable value, natural product integration, authenticity.
Use competitor angles and reference-video notes only as patterns to differentiate from — never copy them. If "operatorLearnings" contains real results, lean toward formats/hooks that produced link clicks (not just views).
No misleading claims, no fake before/after, no fabricated demonstrations, no health/medical claims.`,
    input: { ...bundle, operatorLearnings: learnings },
  });
  const id = await withUser(userId, async (db) => {
    const [r] = await db<{ id: string }[]>`insert into public.content_packs (user_id, product_id, model, payload)
      values (${userId}, ${productId}, ${meta.model}, ${db.json(data as never)}) returning id`;
    return r.id;
  });
  return { id, data, meta };
}

// ---------------------------------------------------------------------------
export async function generateCompetitorAnalysis(userId: string, productId: string) {
  const bundle = await withUser(userId, (db) => productBundle(db, productId));
  if (bundle.competitors.length === 0) throw badRequest("Add at least one competitor record first.");
  const { data, meta } = await runStructured(userId, {
    feature: "competitor_analysis",
    schema: competitorAnalysisSchema,
    effort: "medium",
    instructions: `Analyse the competitor records the operator collected. Identify positioning, pricing patterns, repeated marketing angles, complaints and presentation patterns, then propose ways to DIFFERENTIATE (better angle, bundle, quality fix for a common complaint, underserved segment) rather than copy. Never claim to know competitors' sales or profitability.`,
    input: { product: bundle.product, deterministicScore: bundle.deterministicScore, competitors: bundle.competitors, observationSeries: bundle.observationSeries.filter((s) => s.metric.startsWith("meta") || s.metric.startsWith("amazon")) },
  });
  const id = await saveReport(userId, productId, "competitor_analysis", `Competitor analysis: ${bundle.product.name}`, meta.model, { competitors: bundle.competitors.length }, data, bundle.product.is_demo);
  return { id, data, meta };
}

// ---------------------------------------------------------------------------
export async function analyzeContentPatterns(userId: string, productId: string) {
  const bundle = await withUser(userId, (db) => productBundle(db, productId));
  if (bundle.referenceVideos.length === 0) throw badRequest("Record at least one public reference video first.");
  const { data, meta } = await runStructured(userId, {
    feature: "content_pattern_analysis",
    schema: contentPatternSchema,
    effort: "medium",
    instructions: `Analyse the publicly available videos the operator recorded (hook text, structure notes and any counts they copied from the platform). Identify hook patterns, structures, demonstration and editing styles, viewer questions and repeated angles. Engagement observations may ONLY use counts present in the data — say when they are missing. Then propose 5 original concepts that use what works without copying any video.`,
    input: { product: bundle.product, referenceVideos: bundle.referenceVideos },
  });
  const id = await saveReport(userId, productId, "content_pattern_analysis", `Content patterns: ${bundle.product.name}`, meta.model, { videos: bundle.referenceVideos.length }, data, bundle.product.is_demo);
  return { id, data, meta };
}

// ---------------------------------------------------------------------------
export async function generateComparison(userId: string, productIds: string[]) {
  const { bundles, prefs } = await withUser(userId, async (db) => {
    const found = await getProductsByIds(db, productIds);
    if (found.length !== productIds.length) throw badRequest("One or more products were not found.");
    return {
      bundles: await Promise.all(productIds.map((id) => productBundle(db, id))),
      prefs: (await db`select testing_budget_usd, weekly_hours, target_margin_pct, max_supplier_cost from public.user_preferences`)[0],
    };
  });
  const { data, meta } = await runStructured(userId, {
    feature: "comparison",
    schema: comparisonSchema,
    effort: "medium",
    instructions: `Compare these products and pick the strongest TESTING candidate for this operator's business model (umbrella store, buys samples, organic faceless short-form only, wants pre-saturation opportunities, healthy economics, practical shipping). Do not simply pick the highest numeric score — weigh confidence, faceless content fit, competition trajectory, unit economics and missing data. Use productId values exactly as given.`,
    input: { operatorPreferences: prefs ?? null, products: bundles },
  });
  const id = await saveReport(userId, null, "comparison", `Comparison: ${bundles.map((b) => b.product.name).join(" vs ")}`, meta.model, { productIds }, data, bundles.some((b) => b.product.is_demo));
  return { id, data, meta };
}

// ---------------------------------------------------------------------------
export async function generateValidationNarrative(userId: string, productId: string, deterministic: unknown) {
  const bundle = await withUser(userId, (db) => productBundle(db, productId));
  const { data, meta } = await runStructured(userId, {
    feature: "validation_analysis",
    schema: validationNarrativeSchema,
    effort: "medium",
    instructions: `Interpret this product test. "deterministicValidation" contains computed funnel metrics, the evidence-sufficiency verdict and next action. Answer each question plainly. Distinguish attention (views, engagement) from purchasing behaviour (clicks, sessions, carts, orders). Never call the product a winner on views alone. If evidence is insufficient, say what additional tests and how much more data are needed.`,
    input: { product: bundle.product, deterministicScore: bundle.deterministicScore, deterministicValidation: deterministic },
  });
  const id = await saveReport(userId, productId, "validation_analysis", `Validation analysis: ${bundle.product.name}`, meta.model, { deterministic }, data, bundle.product.is_demo);
  return { id, data, meta };
}
