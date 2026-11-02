import { requireAdmin } from "@/lib/access";
import { Studio } from "./studio";
export const dynamic = "force-dynamic";
export default async function Page() {
  const { user } = await requireAdmin();
  return <Studio email={user.email ?? "Superadmin"} />;
}
