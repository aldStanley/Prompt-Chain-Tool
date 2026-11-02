import { authorize, apiError, AccessError } from "@/lib/access";
import { UUID } from "@/lib/captions/validation";
export async function GET(request: Request) {
  try {
    const { client } = await authorize();
    const id = new URL(request.url).searchParams.get("chain");
    if (!id || !UUID.test(id)) throw new AccessError(400, "Select a chain");
    const before = new URL(request.url).searchParams.get("before");
    let query = client
      .from("prompt_chain_outputs")
      .select("*")
      .eq("chain_id", id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (before) {
      if (!Number.isFinite(Date.parse(before)))
        throw new AccessError(400, "Invalid cursor");
      query = query.lt("created_at", before);
    }
    const { data, error } = await query;
    if (error) throw error;
    const media = await Promise.all(
      (data ?? []).map(async (row) => {
        const signed = await client.storage
          .from("caption-images")
          .createSignedUrl(row.storage_path, 3600);
        return { ...row, url: signed.data?.signedUrl ?? "" };
      }),
    );
    return Response.json({
      media,
      next: media.length === 20 ? media.at(-1)?.created_at : null,
    });
  } catch (e) {
    return apiError(e);
  }
}
