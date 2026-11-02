import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AccessError } from "@/lib/access";
type PlanStep = {
  id: string;
  name: string;
  system_prompt: string;
  input_kind: string;
  output_format: string;
  model_id: string;
  model_identifier: string;
};
export async function runChain(
  client: SupabaseClient,
  chain: string,
  version: number,
  path: string,
  bytes: Buffer,
  mime: string,
) {
  const start = await client.rpc("studio_start_generation", {
    target_chain: chain,
    expected_version: version,
    metadata: { storage_path: path, mime, bytes: bytes.length },
  });
  if (start.error)
    throw new AccessError(
      start.error.code === "40001" ? 409 : 400,
      start.error.message,
    );
  const { request_id, steps } = start.data as {
    request_id: string;
    steps: PlanStep[];
  };
  let previous = "";
  let captions: string[] = [];
  const deadline = Date.now() + 240000;
  try {
    for (const step of steps) {
      if (Date.now() >= deadline)
        throw new AccessError(
          504,
          "This chain exceeded four minutes. Use fewer steps or shorter prompts.",
        );
      const json = step.output_format === "captions_json";
      const parts =
        step.input_kind === "image"
          ? [
              { text: "Use this image as the input." },
              {
                inlineData: { mimeType: mime, data: bytes.toString("base64") },
              },
            ]
          : [{ text: previous }];
      const time = Date.now();
      let response: Response;
      let payload;
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(step.model_identifier)}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": process.env.GEMINI_API_KEY!,
            },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: step.system_prompt }] },
              contents: [{ role: "user", parts }],
              generationConfig: {
                maxOutputTokens: 2000,
                ...(json
                  ? {
                      responseMimeType: "application/json",
                      responseJsonSchema: {
                        type: "object",
                        properties: {
                          captions: {
                            type: "array",
                            items: { type: "string" },
                            minItems: 1,
                            maxItems: 10,
                          },
                        },
                        required: ["captions"],
                        additionalProperties: false,
                      },
                    }
                  : {}),
              },
            }),
            signal: AbortSignal.timeout(
              Math.min(45000, Math.max(1, deadline - Date.now())),
            ),
          },
        );
        payload = await response.json();
      } catch {
        throw new AccessError(
          502,
          `“${step.name}” timed out or returned invalid data. Retry the run.`,
        );
      }
      const candidate = payload.candidates?.[0];
      const output = (candidate?.content?.parts ?? [])
        .filter((p: { thought?: boolean }) => !p.thought)
        .map((p: { text?: string }) => p.text ?? "")
        .join("")
        .trim();
      const logged = await client.rpc("admin_log_response", {
        target_request: request_id,
        target_step: step.id,
        target_model: step.model_id,
        prompt: step.system_prompt,
        output: output || null,
        payload: {
          usage: payload.usageMetadata ?? null,
          finish_reason: candidate?.finishReason ?? null,
        },
        status_code: response.status,
        duration_ms: Date.now() - time,
      });
      if (logged.error) throw logged.error;
      if (!response.ok)
        throw new AccessError(
          response.status === 429 ? 429 : 502,
          `“${step.name}” failed${response.status === 429 ? " because Gemini reached its request limit" : ""}. Try again later.`,
        );
      if (
        candidate?.finishReason !== "STOP" ||
        !output ||
        output.length > 16000
      )
        throw new AccessError(
          422,
          `“${step.name}” did not produce a complete result. Try another image or prompt.`,
        );
      if (json) {
        try {
          const value = JSON.parse(output).captions;
          if (
            !Array.isArray(value) ||
            value.length < 1 ||
            value.length > 10 ||
            value.some(
              (c: unknown) =>
                typeof c !== "string" || !c.trim() || c.length > 500,
            )
          )
            throw Error();
          captions = value;
        } catch {
          throw new AccessError(
            502,
            "The final step must return an object with 1–10 short caption strings.",
          );
        }
      }
      previous = output;
    }
    const done = await client.rpc("studio_finish_generation", {
      target_request: request_id,
      output_text: previous,
      output_captions: captions,
    });
    if (done.error) throw done.error;
    return { request_id };
  } catch (e) {
    await client.rpc("admin_finish_generation", {
      target_request: request_id,
      succeeded: false,
      failure:
        e instanceof AccessError
          ? e.message
          : "Generation interrupted. Please retry.",
    });
    throw e;
  }
}
