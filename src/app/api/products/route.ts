import { apiHandler } from "@/lib/api/handler";
import { productFiltersSchema, productInputSchema } from "@/lib/validation/products";
import { createProduct, listProducts } from "@/lib/services/products";
import { scoreProduct } from "@/lib/services/scoring";
import { audit } from "@/lib/services/audit";

export const GET = apiHandler({ query: productFiltersSchema }, async ({ db, query }) => listProducts(db, query));

export const POST = apiHandler(
  { body: productInputSchema, rateLimit: { bucket: "products:create", limit: 60, windowSec: 60 } },
  async ({ db, user, body }) => {
    const id = await createProduct(db, user.id, body);
    await scoreProduct(db, user.id, id);
    await audit(db, user.id, "product.create", "product", id, { name: body.name });
    return { id };
  },
);

export const dynamic = "force-dynamic";
