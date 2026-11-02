import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return new Response("Forbidden", { status: 403 });
  await (await createClient()).auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
