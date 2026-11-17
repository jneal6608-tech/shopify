/** Market position class derived deterministically from the competition score. */
export function marketPosition(competitionScore: number | null, trendClass: string | null): { label: string; tone: "good" | "info" | "warn" | "bad" | "neutral"; explanation: string } {
  if (competitionScore === null) return { label: "Unknown", tone: "neutral", explanation: "No competition indicators recorded yet." };
  if (competitionScore < 25 || trendClass === "saturating")
    return { label: "Potentially saturated", tone: "bad", explanation: `Competition score ${Math.round(competitionScore)} (< 25) or a saturating trend: many sellers, heavy ad activity or large incumbents.` };
  if (competitionScore < 45) return { label: "Highly competitive", tone: "warn", explanation: `Competition score ${Math.round(competitionScore)} (25–44).` };
  if (competitionScore < 70) return { label: "Moderately competitive", tone: "info", explanation: `Competition score ${Math.round(competitionScore)} (45–69).` };
  return { label: "Underserved", tone: "good", explanation: `Competition score ${Math.round(competitionScore)} (≥ 70): few visible competitors/ads relative to the indicators recorded.` };
}
