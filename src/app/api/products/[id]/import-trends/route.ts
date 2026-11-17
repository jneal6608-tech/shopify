import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { badRequest } from "@/lib/api/errors";
import { parseGoogleTrendsCsv } from "@/lib/sources/google-trends-csv";
import { insertObservations } from "@/lib/services/observations";
import { scoreProduct } from "@/lib/services/scoring";
import { uuid } from "@/lib/validation/common";

export const POST = apiHandler(
  { body: z.object({ csv: z.string().min(10).max(900_000), termIndex: z.number().int().min(0).max(4).default(0), geo: z.string().trim().max(20).default("US") }) },
  async ({ db, user, params, body }) => {
    const id = uuid.parse(params.id);
    let parsed;
    try {
      parsed = parseGoogleTrendsCsv(body.csv);
    } catch (e) {
      throw badRequest((e as Error).message);
    }
    const s = parsed.series[body.termIndex];
    if (!s) throw badRequest(`The file has ${parsed.series.length} term(s); column ${body.termIndex + 1} does not exist.`);
    const r = await insertObservations(
      db,
      user.id,
      id,
      s.points.map((p) => ({
        sourceKey: "google_trends_csv",
        metric: "search_interest",
        query: s.term,
        geo: body.geo,
        observedAt: p.date,
        value: p.value,
        sourceUrl: `https://trends.google.com/trends/explore?q=${encodeURIComponent(s.term)}`,
        raw: { importedGeo: parsed.geo },
      })),
    );
    const score = await scoreProduct(db, user.id, id);
    return { term: s.term, terms: parsed.terms, ...r, skippedRows: parsed.skippedRows, score: score.result.total };
  },
);
