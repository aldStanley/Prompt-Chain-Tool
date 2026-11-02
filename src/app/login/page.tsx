import { GoogleSignIn } from "./google-sign-in";
import { Theme } from "../theme";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="login">
      <div className="login-top">
        <a className="brand" href="/">
          ✳{" "}
          <span>
            CAPTION LAB <small>PROMPT STUDIO</small>
          </span>
        </a>
        <Theme />
      </div>
      <section className="login-card">
        <span className="eyebrow">THE WORKSHOP BEHIND THE PUNCHLINE</span>
        <h1>
          Good humor.
          <br />
          By design<span className="acid">.</span>
        </h1>
        <p>
          Turn a photo into a point of view. Build the prompts, connect the
          steps, and find the funny.
        </p>
        <div className="login-flow">
          <span>01 · OBSERVE</span>
          <span>→</span>
          <span>02 · CONNECT</span>
          <span>→</span>
          <span>03 · CAPTION</span>
        </div>
        <GoogleSignIn />
        {error && (
          <p role="alert" className="error">
            {error === "forbidden"
              ? "This account does not have superadmin access. Switch to an approved Google account."
              : "Sign-in could not be completed. Please try again."}
          </p>
        )}
        <p className="muted">Private workspace · Google superadmins only</p>
        <form action="/auth/signout" method="post">
          <button className="text-button">Switch account / sign out</button>
        </form>
      </section>
      <footer>
        CAPTION LAB / THE HUMOR PROJECT <span>MAKE EVERY STEP COUNT ↗</span>
      </footer>
    </main>
  );
}
