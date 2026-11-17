# Scoring & analysis methodology (formula v1.1)

All formulas live in `src/lib/analytics/` and are unit-tested. The AI never sets or adjusts any of these values.

## Opportunity score (0–100)

`total = Σ (componentScore × weight) / Σ weight`, where a component with no usable data is **imputed at 25** (well below neutral) and listed under *Missing information*.

| Component | Default weight | Inputs → score |
|---|---|---|
| Demand growth | 20% | Search-interest series (≥8 points over ≥49 days). Growth % = mean of the last 25% of points vs the preceding 50%, mapped through a curve (−60%→0, −20%→20, 0%→40, +25%→60, +60%→78, +120%→90, +250%→100); ±5 for acceleration beyond ±10%; −5 if seasonal |
| Organic content potential | 20% | 12 faceless formats rated 0–3: 70% × mean of best five + 30% × mean of all, ÷3 |
| Profit potential | 20% | Contribution before marketing (price − supplier − shipping − payment fees − refunds − other). 60% margin curve (0→0, 15%→20, 30%→50, 45%→75, 60%→92, 70%→100) + 40% absolute-contribution curve ($0→0, $5→25, $10→50, $20→80, $35→100). Unknown shipping assumes **$6** and is flagged |
| Competition (higher = less competitive) | 15% | 100 − mean pressure of available indicators: Meta active ads, tracked competitors, top Amazon listing reviews, recent YouTube Shorts in sample; −5 if active ads are rising |
| Problem-solving value | 10% | (severity + frequency + clarity) / 15, each 0–5 |
| Market longevity | 10% | Mean of: trend class mapping (stable 75, emerging 65, rapidly rising 55, seasonal 50, saturating 35, declining 15; needs ≥180 days) and assessment (70% evergreen + 30% repeat purchase) |
| Shipping practicality | 5% | Mean of weight curve, max delivery-days curve, shipping-cost/price curve; −20 if fragile |

Weights are configurable (must sum to 100). Every change creates a new version with a reason, rescores all products, and is shown in score history.

Economics prefer the cheapest landed **supplier offer** over your manual estimate; the selling price falls back to the median competitor price (≥2 recorded) when you have not set one.

## Confidence (0–100)

`100 × (0.35·completeness + 0.20·reliability + 0.20·freshness + 0.10·agreement + 0.15·sampleSize)`

- **Completeness** — share of scoring weight with real data.
- **Reliability** — weight-averaged source reliability (API 0.7–0.85, CSV 0.85, manual 0.6–0.65, user rubric 0.6, AI rubric 0.35, estimates capped at 0.4, demo 0.5).
- **Freshness** — newest input age: ≤7 d 1.0, ≤14 0.9, ≤30 0.75, ≤60 0.55, ≤120 0.35, older 0.15 (assessments: ≤90 d 1.0, ≤180 0.7, else 0.5).
- **Agreement** — independent demand signals (search trend, YouTube/TikTok series): all agree 1.0, partial 0.65, opposite 0.3, single signal 0.6.
- **Sample size** — search-interest points: ≥52 → 1.0, ≥26 → 0.85, ≥12 → 0.65, ≥8 → 0.45, fewer → 0.2, none → 0.

## Recommendation rules (in order)

1. Completeness < 50% or confidence < 35 → **Insufficient evidence**
2. Profit < 35 → **Weak profit potential**
3. Competition < 25 → **Too competitive**
4. Total ≥ 72 and confidence ≥ 55 → **Strong candidate for testing**
5. Total ≥ 58 → **Worth investigating**
6. Demand ≥ 60 → **Monitor for further growth**
7. Otherwise → **Avoid for now**

## Trend classification

Requires ≥8 points over ≥49 days, else **Insufficient data**. Then, in order:
- **Seasonal** — monthly profiles of the last 12 months and the 12 before are *detrended* and correlate ≥ 0.6 with amplitude ≥ 20% of the level.
- **Rapidly rising** — growth ≥ +100%. **Emerging** — growth ≥ +25%. **Declining** — growth ≤ −20%.
- **Saturating** — rose earlier (first-quarter mean ≤ 60% of recent), now plateaued near the peak (recent ≥ 70% of peak, flat or falling slope) **and** active ads are rising.
- Otherwise **Stable**.

Range percentage changes (7d / 30d / 90d / 12m) compare the selected window with the preceding window of equal length and are shown only when both contain ≥2 points.

## Market position (competition score)

≥70 Underserved · 45–69 Moderately competitive · 25–44 Highly competitive · <25 or saturating trend Potentially saturated · no indicators → Unknown.

## Supplier reliability

Starts at 100; each warning −12, critical −30, info −3; sample rated ≥4/5 +10. Flags include unclear specs, low/no store rating, thin review history, product vs store rating gap ≥0.6, slow (>20 d) or wide (>10 d) delivery windows, missing/no-returns policy, new supplier (<1 yr), new supplier priced >40% below peers, missing URL, MOQ > 1, poor sample. Offers are ranked by reliability band, then landed cost.

## Validation verdict (testing workspace)

Attention (views, engagement), intent (link clicks, profile visits) and purchase (sessions, carts, orders) are assessed separately. Thresholds: ≥3 videos and ≥5,000 views for attention; ≥100 clicks or sessions for intent; ≥150 sessions or ≥5 orders for purchase. Verdicts: insufficient evidence · weak attention · attention without intent · intent without conversion · converting · converting unprofitably — each with a next action. Views alone can never produce a positive verdict.

## Alerts

Compared between consecutive score snapshots, deduplicated by key: trend turned upward, growth crossed the substantial-growth threshold (default 50%), growth fell below the decline threshold (−20%), active ads up ≥30%, tracked competitors +3, opportunity score moved ≥8 points. Thresholds are configurable globally and per watchlist item.

## Testing priorities

Capacity = min(weekly hours ÷ 4 h per test, budget ÷ average sample cost). Priority = opportunity × (0.5 + 0.5 × confidence), +40 converting, +10 intent without conversion, −30 weak attention, −10 converting unprofitably, +10 already in progress. Top items within capacity are *continue*/*start*, active weak-attention tests are *stop*, the rest *wait*.

## Learning loop

With ≥2 products that performed well and ≥2 that performed poorly (non-demo), the component with the largest mean-score difference gains 5 weight points from the component with the smallest difference (if the difference is ≥10). Shown as a suggestion with evidence; applied only when you accept it.
