import "server-only";
import type { Db } from "../db";
import { createProduct } from "./products";
import { insertObservations } from "./observations";
import { scoreProduct } from "./scoring";
import { ensureTestingProject } from "./testing";

/**
 * SYNTHETIC DEMO DATA for development and UI exploration only.
 * Every record is flagged is_demo and/or uses the "demo" data source, product
 * names are prefixed "[DEMO]", and the UI labels them everywhere. Nothing here
 * describes real market conditions.
 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

type Shape = "rising" | "emerging" | "stable" | "seasonal" | "declining" | "saturating";
function series(shape: Shape, weeks: number, seed: number, now = new Date()) {
  const r = rng(seed);
  return Array.from({ length: weeks }, (_, i) => {
    const t = i / (weeks - 1);
    const date = new Date(now.getTime() - (weeks - 1 - i) * 7 * 86_400_000);
    let v: number;
    switch (shape) {
      case "rising": v = 12 + 80 * t ** 3; break;
      case "emerging": v = 25 + 22 * Math.max(0, t - 0.6) / 0.4 * 1.6; break;
      case "stable": v = 55; break;
      case "seasonal": { const m = date.getUTCMonth(); v = m === 10 || m === 11 ? 85 : m === 0 ? 50 : 22; break; }
      case "declining": v = 80 - 55 * t; break;
      case "saturating": v = t < 0.4 ? 20 + 150 * t : 78; break;
    }
    return { date: date.toISOString(), value: Math.max(0, Math.min(100, Math.round(v + (r() - 0.5) * 8))) };
  });
}

const DEMO_PRODUCTS: Array<{ name: string; cat: string; shape: Shape; price: number; cost: number; ship: number; weight: number; fragile: boolean; problem: string; customer: string; content: number[]; problemR: [number, number, number]; long: [number, number]; ads: number[]; yt: number[]; competitors: number; stage?: string }> = [
  { name: "[DEMO] Self-cleaning pet grooming brush", cat: "pet-products", shape: "rising", price: 29.99, cost: 6.2, ship: 3.1, weight: 220, fragile: false, problem: "Fur build-up in brushes; slow grooming", customer: "Dog and cat owners", content: [3, 3, 3, 3, 2, 2, 2, 3, 2, 2, 1, 2], problemR: [3, 5, 5], long: [4, 2], ads: [6, 9, 14], yt: [8, 12, 19], competitors: 3, stage: "testing" },
  { name: "[DEMO] Magnetic cable organizer", cat: "tech-accessories", shape: "emerging", price: 19.99, cost: 3.4, ship: 2.2, weight: 90, fragile: false, problem: "Tangled desk cables", customer: "Home office workers", content: [3, 3, 2, 2, 2, 2, 2, 3, 2, 3, 1, 2], problemR: [2, 4, 5], long: [4, 1], ads: [3, 4], yt: [5, 7], competitors: 2 },
  { name: "[DEMO] Car seat gap filler", cat: "car-accessories", shape: "stable", price: 24.99, cost: 4.1, ship: 3.5, weight: 260, fragile: false, problem: "Phones and keys falling between seats", customer: "Drivers", content: [2, 3, 1, 1, 2, 1, 2, 2, 2, 1, 1, 2], problemR: [3, 4, 5], long: [4, 1], ads: [40, 48, 55], yt: [22, 25], competitors: 8 },
  { name: "[DEMO] Heated winter gloves", cat: "outdoor", shape: "seasonal", price: 39.99, cost: 11.5, ship: 5.5, weight: 320, fragile: false, problem: "Cold hands outdoors", customer: "Commuters, hikers", content: [2, 2, 2, 1, 2, 2, 1, 2, 2, 2, 2, 2], problemR: [3, 3, 4], long: [3, 1], ads: [20, 35], yt: [15, 30], competitors: 6 },
  { name: "[DEMO] LED galaxy projector", cat: "lifestyle", shape: "declining", price: 34.99, cost: 9.8, ship: 6.5, weight: 650, fragile: true, problem: "Bedroom ambience", customer: "Teens, gamers", content: [3, 1, 1, 3, 1, 1, 2, 2, 1, 3, 2, 1], problemR: [1, 2, 3], long: [2, 1], ads: [150, 120], yt: [45, 38], competitors: 18 },
  { name: "[DEMO] Collapsible silicone food containers", cat: "home-kitchen", shape: "saturating", price: 27.99, cost: 7.9, ship: 4.8, weight: 480, fragile: false, problem: "Bulky containers take up cupboard space", customer: "Small-kitchen households", content: [3, 3, 2, 3, 2, 2, 1, 2, 2, 2, 1, 2], problemR: [2, 4, 4], long: [4, 3], ads: [25, 60, 110], yt: [20, 32, 45], competitors: 11 },
  { name: "[DEMO] Posture corrector strap", cat: "fitness-accessories", shape: "stable", price: 22.99, cost: 3.9, ship: 2.9, weight: 150, fragile: false, problem: "Slouching at a desk", customer: "Office workers", content: [1, 2, 2, 0, 1, 2, 1, 2, 2, 1, 1, 1], problemR: [3, 4, 3], long: [3, 1], ads: [], yt: [], competitors: 0 },
];

export async function loadDemoData(db: Db, userId: string) {
  const [exists] = await db<{ n: number }[]>`select count(*)::int as n from public.products where is_demo`;
  if (exists.n > 0) return { created: 0, message: "Demo data is already loaded." };
  const cats = await db<{ id: string; slug: string }[]>`select id, slug from public.categories where user_id is null`;
  const now = new Date();
  const [supA] = await db<{ id: string }[]>`insert into public.suppliers (user_id, name, platform, store_rating, store_review_count, years_active, location, return_policy, is_demo)
    values (${userId}, '[DEMO] Shenzhen Goods Co.', 'aliexpress', 4.8, 12500, 6, 'CN warehouse', '15-day returns for defects', true) returning id`;
  const [supB] = await db<{ id: string }[]>`insert into public.suppliers (user_id, name, platform, store_rating, store_review_count, years_active, location, return_policy, is_demo)
    values (${userId}, '[DEMO] NewStar Trading', 'aliexpress', 4.3, 80, 0.4, 'CN', 'No returns', true) returning id`;
  let i = 0;
  for (const d of DEMO_PRODUCTS) {
    i++;
    const id = await createProduct(db, userId, {
      name: d.name, description: "Synthetic demo product used to illustrate the platform. Not real market data.",
      categoryId: cats.find((c) => c.slug === d.cat)?.id ?? null, targetCustomer: d.customer, problemSolved: d.problem,
      keywords: [d.name.replace("[DEMO] ", "").toLowerCase()], estSupplierCost: d.cost, estShippingCost: d.ship, estSellingPrice: d.price,
      weightGrams: d.weight, isFragile: d.fragile, discoverySource: "demo",
    }, { isDemo: true });
    const q = d.name.replace("[DEMO] ", "").toLowerCase();
    await insertObservations(db, userId, id, series(d.shape, 104, i * 97, now).map((p) => ({ sourceKey: "demo", metric: "search_interest", query: q, observedAt: p.date, value: p.value, isDemo: true })));
    const days = (n: number, k: number) => new Date(now.getTime() - (n - 1 - k) * 14 * 86_400_000).toISOString();
    await insertObservations(db, userId, id, [
      ...d.ads.map((v, k) => ({ sourceKey: "demo", metric: "meta_active_ads", query: q, observedAt: days(d.ads.length, k), value: v, isDemo: true })),
      ...d.yt.map((v, k) => ({ sourceKey: "demo", metric: "youtube_recent_videos", query: q, observedAt: days(d.yt.length, k), value: v, isDemo: true })),
    ]);
    for (let c = 0; c < d.competitors; c++) {
      await db`insert into public.competitors (user_id, product_id, name, channel, price, review_count, avg_rating, ad_activity, marketing_angles, complaints, is_demo)
        values (${userId}, ${id}, ${`[DEMO] Competitor store ${c + 1}`}, ${c % 3 === 0 ? "amazon" : "shopify_store"}, ${Math.round((d.price * (0.8 + (c % 5) * 0.1)) * 100) / 100},
          ${(c + 1) * 140}, ${4.1 + (c % 3) * 0.2}, ${c % 4 === 0 ? "heavy" : "some"}, ${["Problem-solution demo", "Gift angle"]}, ${c % 2 ? ["Slow shipping", "Smaller than expected"] : ["Broke after a month"]}, true)`;
    }
    const content = Object.fromEntries(["closeup_demo", "problem_solution", "before_after", "satisfying", "comparison", "educational", "curiosity", "text_overlay", "voiceover", "cinematic", "unboxing", "customer_use"].map((k, j) => [k, d.content[j]]));
    await db`insert into public.product_assessments (user_id, product_id, kind, ratings, assessed_by, notes) values
      (${userId}, ${id}, 'content', ${db.json(content)}, 'user', 'Demo rating'),
      (${userId}, ${id}, 'problem', ${db.json({ severity: d.problemR[0], frequency: d.problemR[1], clarity: d.problemR[2] })}, 'user', 'Demo rating'),
      (${userId}, ${id}, 'longevity', ${db.json({ evergreen: d.long[0], repeatPurchase: d.long[1] })}, 'user', 'Demo rating')`;
    await db`insert into public.supplier_offers (user_id, supplier_id, product_id, unit_cost, shipping_cost, ship_days_min, ship_days_max, moq, has_clear_specs, product_rating, product_review_count, is_demo)
      values (${userId}, ${supA.id}, ${id}, ${d.cost}, ${d.ship}, 7, 12, 1, true, 4.7, 850, true),
             (${userId}, ${supB.id}, ${id}, ${Math.round(d.cost * 0.55 * 100) / 100}, ${d.ship}, 10, 28, 1, false, 3.9, 12, true)`;
    if (i <= 2) await db`insert into public.watchlist_items (user_id, product_id, baseline_score) values (${userId}, ${id}, null) on conflict do nothing`;
    if (d.stage === "testing") {
      await db`update public.products set stage = 'testing' where id = ${id}`;
      await db`insert into public.product_stage_events (user_id, product_id, from_stage, to_stage, reason) values (${userId}, ${id}, 'discovered', 'testing', 'Demo')`;
      await ensureTestingProject(db, userId, id);
      await db`update public.testing_projects set budget_usd = 150, sample_cost = 9.30, hypothesis = 'Satisfying close-up demos drive link clicks', success_criteria = '≥5 orders from ≥150 sessions in 14 days' where product_id = ${id}`;
      const vids = [
        { hook: "Watch the fur disappear with one click", format: "satisfying", views: [4200, 18500], clicks: [40, 190] },
        { hook: "Your brush is dirtier than you think", format: "problem_solution", views: [2600, 9100], clicks: [22, 85] },
        { hook: "3 seconds to a clean brush", format: "closeup_demo", views: [1500, 3900], clicks: [9, 31] },
      ];
      for (const [k, v] of vids.entries()) {
        const [vid] = await db<{ id: string }[]>`insert into public.published_videos (user_id, product_id, platform, title, hook, format, duration_sec, published_at, is_demo)
          values (${userId}, ${id}, ${k === 1 ? "instagram" : "tiktok"}, ${`[DEMO] Video ${k + 1}`}, ${v.hook}, ${v.format}, 18, ${new Date(now.getTime() - (12 - k) * 86_400_000)}, true) returning id`;
        for (const [s, views] of v.views.entries()) {
          await db`insert into public.video_performance (user_id, video_id, captured_at, views, likes, comments, shares, saves, profile_visits, link_clicks, source)
            values (${userId}, ${vid.id}, ${new Date(now.getTime() - (8 - s * 6) * 86_400_000)}, ${views}, ${Math.round(views * 0.07)}, ${Math.round(views * 0.004)}, ${Math.round(views * 0.006)}, ${Math.round(views * 0.01)}, ${Math.round(views * 0.012)}, ${v.clicks[s]}, 'demo')`;
        }
      }
      await db`insert into public.sales_performance (user_id, product_id, period_start, period_end, sessions, add_to_carts, orders, units, revenue, refund_count, refunds_amount, source)
        values (${userId}, ${id}, ${new Date(now.getTime() - 12 * 86_400_000)}, ${new Date(now.getTime() - 86_400_000)}, 268, 21, 7, 8, 239.92, 0, 0, 'demo')`;
    }
    await scoreProduct(db, userId, id, { now });
  }
  await db`insert into public.discovery_candidates (user_id, query, source_key, evidence, is_demo) values
    (${userId}, '[demo] pet hair remover roller', 'demo', ${db.json({ seed: "pet grooming", risingValue: "+250% (synthetic)" })}, true),
    (${userId}, '[demo] under desk cable tray', 'demo', ${db.json({ seed: "desk setup", risingValue: "+140% (synthetic)" })}, true)
    on conflict do nothing`;
  return { created: DEMO_PRODUCTS.length, message: `Loaded ${DEMO_PRODUCTS.length} demo products.` };
}

export async function removeDemoData(db: Db) {
  const p = await db`delete from public.products where is_demo`;
  await db`delete from public.suppliers where is_demo`;
  await db`delete from public.discovery_candidates where is_demo`;
  await db`delete from public.research_reports where is_demo`;
  return { removedProducts: p.count };
}
