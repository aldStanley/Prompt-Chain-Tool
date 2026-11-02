import { authorize, sameOrigin, apiError, AccessError } from "@/lib/access";
import { UUID } from "@/lib/captions/validation";
export async function GET() {
  try {
    const { client } = await authorize();
    const [chains, models] = await Promise.all([
      client
        .from("prompt_chains")
        .select("*,prompt_chain_steps(*)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      client
        .from("llm_models")
        .select(
          "id,name,enabled,supports_vision,llm_providers(name,provider_type,enabled)",
        )
        .order("name"),
    ]);
    if (chains.error || models.error) throw chains.error || models.error;
    return Response.json({ chains: chains.data, models: models.data });
  } catch (e) {
    return apiError(e);
  }
}
async function mutate(request: Request, remove = false) {
  try {
    const { client } = await authorize();
    sameOrigin(request);
    let b;
    try {
      b = await request.json();
    } catch {
      throw new AccessError(400, "Invalid JSON");
    }
    if (
      (b.id !== null && (typeof b.id !== "string" || !UUID.test(b.id))) ||
      !Number.isInteger(b.version) ||
      b.version < 0
    )
      throw new AccessError(400, "Invalid chain or version");
    if (remove && !b.id) throw new AccessError(400, "Select a chain");
    if (
      !remove &&
      (typeof b.name !== "string" ||
        !b.name.trim() ||
        b.name.length > 100 ||
        typeof b.description !== "string" ||
        b.description.length > 2000 ||
        !Array.isArray(b.steps) ||
        b.steps.length > 8)
    )
      throw new AccessError(400, "Enter a chain name and up to eight steps");
    const result = remove
      ? await client.rpc("studio_delete_chain", {
          target_id: b.id,
          expected_version: b.version,
        })
      : await client.rpc("studio_save_chain", {
          target_id: b.id,
          expected_version: b.version,
          chain_name: b.name,
          chain_description: b.description,
          steps: b.steps,
        });
    if (result.error) {
      const code = result.error.code;
      throw new AccessError(
        code === "40001" ? 409 : 400,
        code === "23505"
          ? "A chain with this name already exists."
          : result.error.message,
      );
    }
    return Response.json({ id: result.data, ok: true });
  } catch (e) {
    return apiError(e);
  }
}
export const POST = (r: Request) => mutate(r);
export const DELETE = (r: Request) => mutate(r, true);
