import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { createCategory, listCategories } from "@/lib/services/products";
import { keywordList } from "@/lib/validation/common";

export const GET = apiHandler({}, async ({ db }) => listCategories(db));

export const POST = apiHandler(
  { body: z.object({ name: z.string().trim().min(1).max(80), description: z.string().trim().max(500).default(""), seedKeywords: keywordList.default([]) }) },
  async ({ db, user, body }) => createCategory(db, user.id, body.name, body.description, body.seedKeywords),
);
