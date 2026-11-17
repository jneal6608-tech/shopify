import "server-only";
import type { Db } from "../db";
import { stableHash } from "../crypto";
import type { ComponentResult } from "../analytics/scoring";

export interface EvidenceItem {
  label: string;
  value: string;
  basis: string;
  source: string;
  at: string | null;
}

export interface Recommendation {
  productId: string;
  productName: string;
  text: string;
  confidence: number;
  score: number;
  evidence: EvidenceItem[];
  scoreId: string;
  computedAt: string;
  isDemo: boolean;
}

function describe(c: ComponentResult | undefined, words: [string, string, string]): string | null {
  if (!c || c.score === null) return null;
  return c.score >= 70 ? words[0] : c.score >= 50 ? words[1] : words[2];
}

/**
 * The dashboard's "strongest opportunity" — chosen by formula, explained from
 * component scores. Every clause maps to a component with its basis and date.
 */
export async function strongestOpportunity(db: Db, opts: { excludeDemo?: boolean } = {}): Promise<Recommendation | null> {
  const [p] = await db<Array<{ id: string; name: string; isDemo: boolean; scoreId: string; scoreTotal: number; scoreConfidence: number }>>`
    select id, name, is_demo, score_id, score_total, score_confidence from public.product_overview
    where score_id is not null and score_confidence >= 50 and recommendation in ('strong_candidate', 'worth_investigating')
      and stage in ('discovered', 'researching', 'selected_for_testing') ${opts.excludeDemo ? db`and not is_demo` : db``}
    order by score_total * (0.5 + score_confidence / 200.0) desc limit 1`;
  if (!p) return null;
  const [s] = await db<Array<{ components: ComponentResult[]; computedAt: Date }>>`select components, computed_at from public.product_scores where id = ${p.scoreId}`;
  const get = (k: string) => s.components.find((c) => c.key === k);
  const clauses = [
    describe(get("demand"), ["demand indicators are increasing", "demand is steady", "demand is weak"]),
    describe(get("content"), ["organic faceless content potential is strong", "content potential is moderate", "content potential is limited"]),
    describe(get("competition"), ["competition appears manageable", "competition is moderate", "competition is heavy"]),
    describe(get("profit"), ["unit economics look healthy", "margins are workable", "margins are thin"]),
  ].filter(Boolean) as string[];
  const text = `Your strongest opportunity today is ${p.name} because ${clauses.length > 1 ? `${clauses.slice(0, -1).join(", ")} and ${clauses.at(-1)}` : clauses[0] ?? "it has the best evidence-weighted score"}.`;
  const evidence: EvidenceItem[] = s.components
    .filter((c) => c.score !== null)
    .map((c) => ({
      label: c.label,
      value: `${Math.round(c.score!)}/100`,
      basis: c.basis,
      source: c.explanation[0] ?? "",
      at: c.latestAt,
    }));
  return { productId: p.id, productName: p.name, text, confidence: p.scoreConfidence, score: p.scoreTotal, evidence, scoreId: p.scoreId, computedAt: s.computedAt.toISOString(), isDemo: p.isDemo };
}

/** Stores a recommendation once per distinct evidence set (no repeats without new evidence). */
export async function recordRecommendation(db: Db, userId: string, context: string, r: Recommendation): Promise<boolean> {
  const hash = stableHash({ productId: r.productId, scoreId: r.scoreId });
  const res = await db`
    insert into public.ai_recommendations (user_id, product_id, context, recommendation, rationale, evidence, confidence, evidence_hash, score_total)
    values (${userId}, ${r.productId}, ${context}, ${r.text}, ${"Deterministic: highest evidence-weighted opportunity score with confidence ≥ 50."},
      ${db.json(r.evidence as never)}, ${r.confidence}, ${hash}, ${r.score})
    on conflict (user_id, context, evidence_hash) do nothing`;
  return res.count > 0;
}

export interface DailySummary {
  since: string;
  until: string;
  newProducts: Array<{ id: string; name: string }>;
  newCandidates: Array<{ query: string; evidence: unknown }>;
  increasing: Array<{ id: string; name: string; from: number | null; to: number | null; growthPct: number | null }>;
  losingMomentum: Array<{ id: string; name: string; from: number | null; to: number | null; growthPct: number | null }>;
  categoryDevelopments: Array<{ category: string; rising: number; declining: number; products: number }>;
  competitionChanges: Array<{ title: string; message: string }>;
  recommended: Array<{ id: string; name: string; score: number; confidence: number; reason: string }>;
}

export async function buildDailySummary(db: Db, userId: string, since: Date): Promise<DailySummary> {
  const until = new Date();
  const newProducts = await db<{ id: string; name: string }[]>`select id, name from public.products where created_at >= ${since} order by created_at`;
  const newCandidates = await db<{ query: string; evidence: unknown }[]>`select query, evidence from public.discovery_candidates where first_seen_at >= ${since} and status = 'new' limit 20`;
  const moves = await db<Array<{ id: string; name: string; from: number | null; to: number | null; growthPct: number | null; prevGrowth: number | null }>>`
    select p.id, p.name, prev.total as from, p.score_total as to, p.growth_pct,
      (select (x -> 'inputs' ->> 'growthPct')::numeric from jsonb_array_elements(prev.components) x where x ->> 'key' = 'demand') as prev_growth
    from public.product_overview p
    join lateral (select total, components from public.product_scores s where s.product_id = p.id and s.computed_at < ${since} order by computed_at desc limit 1) prev on true
    where p.scored_at >= ${since} and p.stage <> 'archived'`;
  const increasing = moves.filter((m) => (m.growthPct ?? 0) - (m.prevGrowth ?? 0) >= 10 || ((m.to ?? 0) - (m.from ?? 0) >= 5)).map(({ prevGrowth: _p, ...m }) => m);
  const losingMomentum = moves.filter((m) => (m.growthPct ?? 0) - (m.prevGrowth ?? 0) <= -10 || ((m.to ?? 0) - (m.from ?? 0) <= -5)).map(({ prevGrowth: _p, ...m }) => m);
  const categoryDevelopments = await db<Array<{ category: string; rising: number; declining: number; products: number }>>`
    select coalesce(category_name, 'Uncategorised') as category,
      count(*) filter (where trend_class in ('emerging','rapidly_rising'))::int as rising,
      count(*) filter (where trend_class = 'declining')::int as declining, count(*)::int as products
    from public.product_overview where stage <> 'archived' group by 1 having count(*) filter (where trend_class in ('emerging','rapidly_rising','declining')) > 0 order by 2 desc`;
  const competitionChanges = await db<{ title: string; message: string }[]>`
    select title, message from public.alerts where kind = 'competition_increase' and created_at >= ${since} order by created_at desc limit 10`;
  // Recommend only products whose current evidence has not been recommended before.
  const candidates = await db<Array<{ id: string; name: string; scoreTotal: number; scoreConfidence: number; scoreId: string; recommendation: string }>>`
    select id, name, score_total, score_confidence, score_id, recommendation from public.product_overview
    where recommendation in ('strong_candidate','worth_investigating') and score_confidence >= 45 and stage in ('discovered','researching')
    order by score_total desc limit 10`;
  const recommended: DailySummary["recommended"] = [];
  for (const c of candidates) {
    const hash = stableHash({ productId: c.id, scoreId: c.scoreId });
    const r = await db`insert into public.ai_recommendations (user_id, product_id, context, recommendation, rationale, evidence, confidence, evidence_hash, score_total)
      values (${userId}, ${c.id}, 'daily_summary', ${`Investigate ${c.name}`}, ${`Score ${c.scoreTotal}, confidence ${c.scoreConfidence}, ${c.recommendation.replace(/_/g, " ")}`},
        ${db.json({ scoreId: c.scoreId })}, ${c.scoreConfidence}, ${hash}, ${c.scoreTotal})
      on conflict (user_id, context, evidence_hash) do nothing`;
    if (r.count > 0) recommended.push({ id: c.id, name: c.name, score: c.scoreTotal, confidence: c.scoreConfidence, reason: c.recommendation.replace(/_/g, " ") });
    if (recommended.length >= 5) break;
  }
  return { since: since.toISOString(), until: until.toISOString(), newProducts, newCandidates, increasing, losingMomentum, categoryDevelopments, competitionChanges, recommended };
}
