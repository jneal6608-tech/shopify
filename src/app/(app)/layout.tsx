import { requireUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { Shell } from "@/components/shell/sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { unread, demo } = await withUser(user.id, async (db) => {
    const [a] = await db<{ n: number }[]>`select count(*)::int as n from public.alerts where read_at is null`;
    const [d] = await db<{ n: number }[]>`select count(*)::int as n from public.products where is_demo`;
    return { unread: a.n, demo: d.n > 0 };
  });
  return (
    <Shell email={user.email} unreadAlerts={unread} hasDemo={demo} authMode={user.mode}>
      {children}
    </Shell>
  );
}
