/**
 * Parser for CSV files exported from trends.google.com ("Download CSV" on the
 * Interest over time chart). Handles the classic export format:
 *
 *   Category: All categories
 *   <blank>
 *   Week,dog paw cleaner: (United States)
 *   2025-11-16,23
 *   ...
 *
 * as well as header-only variants ("Time,term" / "Day,term" / "Month,term"),
 * quoted cells and "<1" values (stored as 0.5).
 */
export interface TrendsCsvResult {
  terms: string[];
  geo: string | null;
  series: Array<{ term: string; points: Array<{ date: string; value: number }> }>;
  skippedRows: number;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const DATE_RE = /^\d{4}-\d{2}(-\d{2})?(T[\d:]+)?/;

export function parseGoogleTrendsCsv(text: string): TrendsCsvResult {
  if (text.length > 2_000_000) throw new Error("File too large");
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => /^\s*"?(week|day|month|time)"?\s*,/i.test(l));
  if (headerIdx === -1) throw new Error("Not a Google Trends CSV: no Week/Day/Month/Time header found");
  const header = splitCsvLine(lines[headerIdx]);
  const rawTerms = header.slice(1);
  if (rawTerms.length === 0) throw new Error("No search terms in header");
  let geo: string | null = null;
  const terms = rawTerms.map((t) => {
    const m = t.match(/^(.*?):\s*\((.*)\)\s*$/);
    if (m) {
      geo = geo ?? m[2];
      return m[1].trim();
    }
    return t;
  });
  const series = terms.map((term) => ({ term, points: [] as Array<{ date: string; value: number }> }));
  let skipped = 0;
  for (const line of lines.slice(headerIdx + 1)) {
    if (!line.trim()) continue;
    const cells = splitCsvLine(line);
    if (!DATE_RE.test(cells[0])) {
      skipped++;
      continue;
    }
    const iso = cells[0].length === 7 ? `${cells[0]}-01` : cells[0];
    const date = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
    if (Number.isNaN(date.getTime())) {
      skipped++;
      continue;
    }
    cells.slice(1).forEach((c, i) => {
      if (!series[i]) return;
      const v = c === "<1" ? 0.5 : Number(c);
      if (Number.isFinite(v) && v >= 0 && v <= 100) series[i].points.push({ date: date.toISOString(), value: v });
    });
  }
  if (series.every((s) => s.points.length === 0)) throw new Error("No data rows found");
  return { terms, geo, series, skippedRows: skipped };
}
