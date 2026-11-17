import { apiHandler } from "@/lib/api/handler";
import { loadDemoData, removeDemoData } from "@/lib/services/demo";

export const maxDuration = 120;
export const POST = apiHandler({ rateLimit: { bucket: "demo", limit: 10, windowSec: 600 } }, async ({ db, user }) => loadDemoData(db, user.id));
export const DELETE = apiHandler({}, async ({ db }) => removeDemoData(db));
