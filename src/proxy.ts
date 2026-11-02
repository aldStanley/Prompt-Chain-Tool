import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getSupabaseUrl,
  getSupabasePublishableKey,
} from "@/lib/supabase/config";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const client = createServerClient(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );
  const path = request.nextUrl.pathname;
  const publicRoute =
    path === "/login" || path === "/auth/callback" || path === "/auth/signout";
  const {
    data: { user },
  } = await client.auth.getUser();
  let status = 401;
  let allowed = false;
  if (user?.app_metadata.provider === "google") {
    const role = await client.rpc("is_superadmin");
    allowed = role.data === true && !role.error;
  }
  if (user) status = 403;
  if (!publicRoute && !allowed) {
    const blocked = path.startsWith("/api/")
      ? NextResponse.json(
          {
            error:
              status === 401
                ? "Google sign-in required."
                : "Superadmin access required.",
          },
          { status },
        )
      : NextResponse.redirect(
          new URL(user ? "/login?error=forbidden" : "/login", request.url),
        );
    response.cookies.getAll().forEach((c) => blocked.cookies.set(c));
    response = blocked;
  }
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
