/**
 * Categorical series palette for the dark surface (#10141f), validated with the
 * dataviz palette validator: lightness band, chroma, adjacent CVD ΔE ≥ 8.4,
 * normal-vision ΔE ≥ 19.3, contrast ≥ 3:1. Assign in this fixed order — never
 * cycle; colour follows the entity, not its rank.
 */
export const SERIES_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"] as const;
export const AXIS = { stroke: "#2f3850", tick: "#8b93a8", grid: "#1c2232" };
