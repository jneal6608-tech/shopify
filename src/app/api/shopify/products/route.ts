import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { getConnection } from "@/lib/shopify/connection";
import { shopifyGraphql } from "@/lib/shopify/client";
import { Q } from "@/lib/shopify/queries";

export const GET = apiHandler({ query: z.object({ q: z.string().max(200).optional() }), noTransaction: true }, async ({ user, query }) =>
  shopifyGraphql(await getConnection(user.id), Q.products, { first: 50, query: query.q || null }),
);
