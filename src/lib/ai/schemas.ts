import { z } from "zod";
import { FORMAT_KEYS } from "../analytics/rubrics";

const basis = z.enum(["measured", "manual", "estimate", "ai_interpretation", "demo"]);
const evidence = z.object({
  claim: z.string(),
  basis,
  source: z.string().describe("Which provided record/series supports this (e.g. 'Google Trends (CSV export), 52 weekly points to 2026-11-09'), or 'none'"),
});

export const evaluationSchema = z.object({
  summary: z.string().describe("2–4 sentence executive summary for this operator's business model"),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  risks: z.array(z.string()),
  competitiveConcerns: z.array(z.string()),
  recommendationRationale: z.string().describe("Why the deterministic recommendation makes sense (or what would change it)"),
  facelessMarketingView: z.string().describe("How well this product suits organic faceless short-form content, and why"),
  evidence: z.array(evidence),
  missingInformation: z.array(z.string()),
  nextSteps: z.array(z.string()).describe("Concrete, ordered next research or testing actions"),
});
export type Evaluation = z.infer<typeof evaluationSchema>;

export const contentAssessmentSchema = z.object({
  contentRatings: z.object(Object.fromEntries(FORMAT_KEYS.map((k) => [k, z.number().int().describe("0 not viable, 1 weak, 2 good, 3 excellent")])) as Record<(typeof FORMAT_KEYS)[number], z.ZodNumber>),
  contentRationale: z.string(),
  problem: z.object({ severity: z.number().int(), frequency: z.number().int(), clarity: z.number().int(), rationale: z.string() }).describe("Each 0–5"),
  longevity: z.object({ evergreen: z.number().int(), repeatPurchase: z.number().int(), rationale: z.string() }).describe("Each 0–5"),
});

const shot = z.object({
  n: z.number().int(),
  seconds: z.number(),
  shot: z.string().describe("What the camera shows (hands/product only — faceless)"),
  onScreenText: z.string(),
  audio: z.string().describe("Voiceover line, sound effect or music cue"),
});
export const contentPackSchema = z.object({
  positioning: z.string().describe("One-paragraph content angle summary for this product"),
  concepts: z
    .array(
      z.object({
        title: z.string(),
        format: z.enum(FORMAT_KEYS),
        angle: z.string(),
        description: z.string(),
        whyItWorks: z.string(),
        platforms: z.array(z.enum(["tiktok", "instagram", "youtube"])),
        differentiation: z.string().describe("How this differs from common competitor content"),
      }),
    )
    .describe("Exactly 10 concepts"),
  hooks: z.array(z.object({ text: z.string(), type: z.string(), visual: z.string() })).describe("Exactly 10 opening hooks (first 1–2 seconds)"),
  scripts: z
    .array(
      z.object({
        title: z.string(),
        format: z.enum(FORMAT_KEYS),
        platform: z.enum(["tiktok", "instagram", "youtube", "all"]),
        durationSeconds: z.number().int(),
        hook: z.string(),
        shots: z.array(shot),
        voiceover: z.string().describe("Full voiceover script, or empty string for text-only videos"),
        textOverlays: z.array(z.string()),
        editingStyle: z.string(),
        caption: z.string(),
        callToAction: z.string(),
        hashtags: z.array(z.string()),
      }),
    )
    .describe("Exactly 5 complete vertical (9:16) scripts"),
  productionNotes: z.array(z.string()).describe("Filming tips for faceless production with a physical sample"),
  complianceNotes: z.array(z.string()).describe("Claims to avoid; truthful demonstration reminders"),
});
export type ContentPack = z.infer<typeof contentPackSchema>;

export const competitorAnalysisSchema = z.object({
  positioningSummary: z.string(),
  pricingObservations: z.string(),
  commonAngles: z.array(z.string()),
  commonComplaints: z.array(z.string()),
  presentationPatterns: z.array(z.string()),
  gaps: z.array(z.string()).describe("Underserved customer needs or segments visible in the data"),
  differentiationOpportunities: z.array(z.object({ idea: z.string(), rationale: z.string(), effort: z.enum(["low", "medium", "high"]) })),
  risks: z.array(z.string()),
  caveats: z.array(z.string()).describe("Limits of this analysis given the data (never claim to know competitor sales)"),
});

export const contentPatternSchema = z.object({
  hookPatterns: z.array(z.object({ pattern: z.string(), examples: z.array(z.string()) })),
  structures: z.array(z.string()),
  demonstrationStyles: z.array(z.string()),
  editingPatterns: z.array(z.string()),
  commonQuestions: z.array(z.string()).describe("Questions viewers likely have, inferred from the notes provided"),
  engagementObservations: z.array(z.string()).describe("Only from counts the user recorded; say when counts are missing"),
  repeatedAngles: z.array(z.string()),
  originalConcepts: z.array(z.object({ title: z.string(), angle: z.string(), whyDifferent: z.string() })).describe("5 original concepts that use the patterns without copying"),
});

export const comparisonSchema = z.object({
  strongestCandidateProductId: z.string().describe("id of the best testing candidate for THIS business model, or 'none'"),
  rationale: z.string(),
  perProduct: z.array(z.object({ productId: z.string(), verdict: z.string(), keyStrengths: z.array(z.string()), keyRisks: z.array(z.string()) })),
  tradeoffs: z.array(z.string()),
  whyNotHighestScore: z.string().describe("If the pick differs from the highest numeric score, why; else empty string"),
  caveats: z.array(z.string()),
});

export const validationNarrativeSchema = z.object({
  bestContent: z.string(),
  bestHooks: z.string(),
  bestForClicks: z.string(),
  purchaseIntent: z.string(),
  websiteConversion: z.string(),
  nextFormatToTest: z.string(),
  worthContinuing: z.string(),
  increaseEffort: z.string(),
  pauseOrDiscontinue: z.string(),
  additionalTestsNeeded: z.array(z.string()),
});

export const listingSchema = z.object({
  title: z.string().describe("≤ 70 characters"),
  descriptionHtml: z.string().describe("Clean HTML: <p>, <ul>, <li>, <strong>, <h3> only"),
  features: z.array(z.string()),
  benefits: z.array(z.string()),
  faqs: z.array(z.object({ q: z.string(), a: z.string() })),
  seoTitle: z.string().describe("≤ 60 characters"),
  seoDescription: z.string().describe("≤ 155 characters"),
  tags: z.array(z.string()),
  productType: z.string(),
  imageSuggestions: z.array(z.string()).describe("Shots/media to capture from the physical sample"),
  claimsToVerify: z.array(z.string()).describe("Statements the operator must verify against the real sample before publishing"),
});
export type Listing = z.infer<typeof listingSchema>;

export const landingPageSchema = z.object({
  headline: z.string(),
  subheadline: z.string(),
  problemTitle: z.string(),
  problemBody: z.string(),
  solutionTitle: z.string(),
  solutionBody: z.string(),
  demoTitle: z.string(),
  demoBody: z.string(),
  benefits: z.array(z.object({ title: z.string(), body: z.string() })),
  specs: z.array(z.object({ label: z.string(), value: z.string() })),
  faqs: z.array(z.object({ q: z.string(), a: z.string() })),
  trustPoints: z.array(z.string()).describe("Only verifiable statements (shipping times, returns policy) — no invented reviews"),
  ctaText: z.string(),
  accentColor: z.string().describe("Hex colour like #2563eb"),
});
export type LandingPage = z.infer<typeof landingPageSchema>;

export const storefrontSchema = z.object({
  homepageHero: z.object({ headline: z.string(), subheadline: z.string(), ctaText: z.string() }),
  announcementBar: z.string(),
  promoBanners: z.array(z.object({ headline: z.string(), body: z.string() })),
  collectionDescriptions: z.array(z.object({ collection: z.string(), descriptionHtml: z.string() })),
  navigation: z.array(z.object({ label: z.string(), target: z.string(), children: z.array(z.string()) })),
  complementaryProductIdeas: z.array(z.string()),
  shippingPolicyDraft: z.string(),
  returnsPolicyDraft: z.string(),
  notes: z.array(z.string()).describe("What must be reviewed or customised before use"),
});

export const dailySummaryNarrativeSchema = z.object({
  headline: z.string(),
  narrative: z.string(),
  focusToday: z.array(z.string()),
});
