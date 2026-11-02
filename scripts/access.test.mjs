import test from "node:test";
import assert from "node:assert/strict";
const base = process.env.TEST_URL ?? "http://localhost:3002";
for (const path of ["/", "/not-a-page", "/api/private"])
  test(`anonymous page protected: ${path}`, async () => {
    const r = await fetch(base + path, { redirect: "manual" });
    assert.equal(r.status, path.startsWith("/api/") ? 401 : 307);
    assert.match(r.headers.get("cache-control"), /no-store/);
    if (!path.startsWith("/api/"))
      assert.equal(new URL(r.headers.get("location"), base).pathname, "/login");
  });
for (const [path, method] of [
  ["/api/chains", "GET"],
  ["/api/chains", "POST"],
  ["/api/chains", "DELETE"],
  ["/api/generate", "POST"],
  ["/api/media?chain=bad", "GET"],
])
  test(`anonymous API denied: ${method} ${path}`, async () => {
    const r = await fetch(base + path, {
      method,
      headers: { Origin: base, "Content-Type": "application/json" },
      ...(method === "GET" ? {} : { body: "{}" }),
    });
    assert.equal(r.status, 401);
    assert.match((await r.json()).error, /sign-in/i);
  });
test("login renders Google and theme controls", async () => {
  const r = await fetch(base + "/login");
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /Continue with Google/);
  assert.match(html, /System/);
  assert.match(html, /Dark/);
  assert.match(html, /Light/);
});
test("invalid callback returns to login", async () => {
  const r = await fetch(base + "/auth/callback?error=denied", {
    redirect: "manual",
  });
  assert.equal(r.status, 303);
  assert.match(r.headers.get("location"), /login\?error=signin/);
});
test("cross-origin signout rejected", async () => {
  const r = await fetch(base + "/auth/signout", {
    method: "POST",
    headers: { Origin: "https://example.invalid" },
    redirect: "manual",
  });
  assert.equal(r.status, 403);
});
