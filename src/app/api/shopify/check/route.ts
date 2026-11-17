import { apiHandler } from "@/lib/api/handler";
import { checkConnection } from "@/lib/shopify/connection";

export const POST = apiHandler({ noTransaction: true }, async ({ user }) => checkConnection(user.id));
