import "server-only";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export class AccessError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function authorize() {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new AccessError(401, "Google sign-in required.");
  if (user.app_metadata.provider !== "google")
    throw new AccessError(403, "Use your Google account.");
  const { data: allowed, error: roleError } = await client.rpc("is_superadmin");
  if (roleError || allowed !== true)
    throw new AccessError(
      403,
      "This Google account does not have superadmin access.",
    );
  return { client, user };
}
export async function requireAdmin() {
  try {
    return await authorize();
  } catch (e) {
    if (e instanceof AccessError)
      redirect(e.status === 401 ? "/login" : "/login?error=forbidden");
    throw e;
  }
}
export function apiError(e: unknown) {
  if (e instanceof AccessError)
    return Response.json({ error: e.message }, { status: e.status });
  console.error(
    "Admin request failed",
    e instanceof Error ? e.message : "Unknown error",
  );
  return Response.json(
    { error: "The request could not be completed. Please retry." },
    { status: 500 },
  );
}
export function sameOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new AccessError(403, "Same-origin request required.");
}
