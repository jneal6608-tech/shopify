import { apiHandler } from "@/lib/api/handler";
import { getConnection } from "@/lib/shopify/connection";
import { shopifyGraphql } from "@/lib/shopify/client";
import { Q } from "@/lib/shopify/queries";

export const GET = apiHandler({ noTransaction: true }, async ({ user }) => shopifyGraphql(await getConnection(user.id), Q.themes));
