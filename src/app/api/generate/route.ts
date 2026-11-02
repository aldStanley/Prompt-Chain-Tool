import { authorize, sameOrigin, apiError, AccessError } from "@/lib/access";
import {
  UUID,
  MAX_IMAGE_BYTES,
  imageExtension,
} from "@/lib/captions/validation";
import { runChain } from "@/lib/chains/run";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    const { client, user } = await authorize();
    sameOrigin(request);
    if (!process.env.GEMINI_API_KEY?.trim())
      throw new AccessError(
        503,
        "The server needs a Gemini API key to generate media.",
      );
    const form = await request.formData();
    const chain = String(form.get("chain") ?? "");
    const version = Number(form.get("version"));
    if (!UUID.test(chain) || !Number.isInteger(version) || version < 1)
      throw new AccessError(400, "Save and select a chain");
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > MAX_IMAGE_BYTES)
      throw new AccessError(400, "Choose a JPG, PNG or WebP up to 3 MB.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const ext = imageExtension(bytes, file.type);
    if (!ext) throw new AccessError(400, "Invalid image format");
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const upload = await client.storage
      .from("caption-images")
      .upload(path, bytes, { contentType: file.type });
    if (upload.error) throw upload.error;
    try {
      return Response.json(
        await runChain(client, chain, version, path, bytes, file.type),
      );
    } catch (e) {
      const referenced = await client
        .from("generation_requests")
        .select("id")
        .contains("input_metadata", { storage_path: path })
        .limit(1);
      if (!referenced.error && !referenced.data?.length)
        await client.storage.from("caption-images").remove([path]);
      throw e;
    }
  } catch (e) {
    return apiError(e);
  }
}
