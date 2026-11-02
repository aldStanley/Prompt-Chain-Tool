import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const client = await createClient();
  let destination = "/login?error=signin";
  if (code && !request.nextUrl.searchParams.has("error")) {
    const flowId = request.nextUrl.searchParams.get("sb_flow_id");
    const { data, error } = await client.auth.exchangeCodeForSession(
      code,
      flowId === null ? undefined : { flowId },
    );
    if (!error && data.user?.app_metadata.provider === "google") {
      const role = await client.rpc("is_superadmin");
      destination =
        role.data === true && !role.error ? "/" : "/login?error=forbidden";
    }
  }
  const response = NextResponse.redirect(
    new URL(destination, request.url),
    303,
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}
