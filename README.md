# Caption Lab — Prompt Studio

A separate Next.js application for creating, editing, reordering and running prompt chains in the existing Caption Lab Supabase project. GitHub: https://github.com/aldStanley/Prompt-Chain-Tool. Vercel project: `prompt-chain-tool`.

## Features

- Create, rename, describe and delete chains; add, edit, remove and reorder up to eight steps using accessible move buttons.
- Choose the model, input type, output format and system prompt for each step. Start from a three-step image → observation → five captions recipe.
- Run a specific saved chain on a JPG, PNG or WebP (up to 3 MB). Each step receives the actual preceding output. Enabled Google Gemini models are supported. Intermediate outputs must be text; the last output may be text or a caption JSON object with 1–10 strings.
- View each chain's generated photo/caption outputs and chain versions, page through older runs, and download result text.
- Light, dark and system appearance modes, persisted per browser.
- Unsaved-change warnings, optimistic version checking, transactional reorder and run/edit locking.

## Setup

1. `npm ci`; copy `.env.example` to `.env.local` and set the same public Supabase URL/key as the other Caption Lab apps, plus a server-only `GEMINI_API_KEY`.
2. The shared database must already contain the admin, domain and superadmin promotion migrations from HumorProjectAdmin. Apply `supabase/migrations/20261102000100_prompt_studio.sql` **once** after those migrations.
3. Add OAuth redirect URLs in Supabase Auth without removing the existing apps' URLs:
   - `http://localhost:3002/auth/callback`
   - `https://prompt-chain-tool.vercel.app/auth/callback`
   - `https://prompt-chain-tool-*-aldstanleys-projects.vercel.app/auth/callback`
4. `npm run dev` on port 3002. `npm run build` and `npm start` for production.
5. Configure the Vercel project's Production and Preview environment variables. Disable Vercel Deployment Protection; the application's own superadmin authentication remains required.

## Access and persistence

Google login uses Supabase PKCE. The request proxy, page, APIs and guarded SQL functions independently require the existing `is_superadmin()` check, which reads `profiles.is_superadmin` and enforces Google authentication. Every response is private/no-store. Mutations enforce same-origin requests. No service-role key is used. Ordinary users cannot promote themselves.

A single guarded SQL transaction saves all steps with a deferrable order constraint and a version check. Editing/deleting a chain is blocked during a recent active run. The runner snapshots the saved plan and chain version, records per-step prompts, outputs, timing and usage in the shared logs, and persists final outputs. A transient network failure retries the same step once and logs both attempts. Provider failures stop downstream execution and mark the request failed. Runs have a four-minute provider budget within Vercel's five-minute function limit. Interrupted requests may remain `running`; the edit/concurrency lock expires after ten minutes.

Chain deletion is soft deletion: it hides the chain, disables its routing mix, and retains logs and media. Removed steps are deleted; historical response rows keep their prompt/output snapshots with a null step reference. Uploaded files are private and displayed through expiring signed URLs. Failed-run input images are retained with their request for debugging. Nothing is automatically published to the public caption board.

## Verification

- `npm run build`: production compilation and TypeScript.
- With production server running: `npm test` (11 HTTP access checks plus 5 mocked generation tests; no provider charges).
- `supabase/tests/studio_security.sql`: transactional SQL tests for anonymous/member denial, blocked self-promotion, CRUD, reordering, concurrency, run locking, media persistence and history retention. All fixtures roll back.
- Live acceptance: Google superadmin login; create/edit/reorder/run a disposable chain; inspect outputs; confirm ordinary users are denied and Incognito reaches the app login.

Production dependencies use patched Next.js 16.4.4. Operational Vercel helper `scripts/vercel-task.mjs` uses the existing local CLI session and never embeds credentials in source.
