"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
export function GoogleSignIn() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function login() {
    setPending(true);
    setError("");
    try {
      const { error } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${location.origin}/auth/callback`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
    } catch {
      setError("Could not open Google. Please try again.");
      setPending(false);
    }
  }
  return (
    <>
      <button className="primary" onClick={login} disabled={pending}>
        <span className="google">G</span>
        {pending ? "Opening Google…" : "Continue with Google"}
        <span>↗</span>
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
