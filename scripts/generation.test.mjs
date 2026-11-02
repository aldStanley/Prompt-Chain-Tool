import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
let source = await readFile(
  new URL("../src/lib/chains/run.ts", import.meta.url),
  "utf8",
);
source = source
  .replace('import "server-only";', "")
  .replace(
    'import { AccessError } from "@/lib/access";',
    "class AccessError extends Error {constructor(public status:number,message:string){super(message)}}",
  );
const { runChain } = await import(
  "data:text/javascript;base64," +
    Buffer.from(
      ts.transpile(source, {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      }),
    ).toString("base64")
);
const plan = [
  {
    id: "1",
    name: "Observe",
    model_id: "m",
    model_identifier: "model",
    input_kind: "image",
    output_format: "text",
    system_prompt: "Describe.",
  },
  {
    id: "2",
    name: "Connect",
    model_id: "m",
    model_identifier: "model",
    input_kind: "previous_text",
    output_format: "text",
    system_prompt: "Find the funny.",
  },
  {
    id: "3",
    name: "Caption",
    model_id: "m",
    model_identifier: "model",
    input_kind: "previous_text",
    output_format: "captions_json",
    system_prompt: "Write five.",
  },
];
function client(error = null) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      return name === "studio_start_generation"
        ? { data: { request_id: "request", steps: plan }, error }
        : { data: null, error: null };
    },
  };
}
function response(text, status = 200) {
  return new Response(
    JSON.stringify({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }],
    }),
    { status },
  );
}
test("three-step run passes actual preceding output and saves five captions", async () => {
  const c = client(),
    requests = [];
  const outputs = [
    "A sleepy cat.",
    "Butler Library after midnight.",
    JSON.stringify({ captions: ["One", "Two", "Three", "Four", "Five"] }),
  ];
  const original = global.fetch;
  global.fetch = async (_url, o) => {
    requests.push(JSON.parse(o.body));
    return response(outputs[requests.length - 1]);
  };
  try {
    assert.deepEqual(
      await runChain(c, "chain", 1, "path", Buffer.from("image"), "image/png"),
      { request_id: "request" },
    );
    assert.ok(requests[0].contents[0].parts[1].inlineData);
    assert.equal(requests[1].contents[0].parts[0].text, outputs[0]);
    assert.equal(requests[2].contents[0].parts[0].text, outputs[1]);
    assert.equal(
      c.calls.filter((c) => c.name === "admin_log_response").length,
      3,
    );
    const saved = c.calls.find((c) => c.name === "studio_finish_generation");
    assert.equal(saved.args.output_captions.length, 5);
  } finally {
    global.fetch = original;
  }
});
test("provider limit stops downstream calls and marks failure", async () => {
  const c = client();
  const original = global.fetch;
  let count = 0;
  global.fetch = async () => {
    count++;
    return response("limit", 429);
  };
  try {
    await assert.rejects(
      runChain(c, "chain", 1, "path", Buffer.from("x"), "image/png"),
      /request limit/,
    );
    assert.equal(count, 1);
    assert.equal(c.calls.at(-1).name, "admin_finish_generation");
    assert.equal(c.calls.at(-1).args.succeeded, false);
    assert.ok(!c.calls.some((c) => c.name === "studio_finish_generation"));
  } finally {
    global.fetch = original;
  }
});
test("invalid final JSON does not create gallery media", async () => {
  const c = client();
  const original = global.fetch;
  global.fetch = async () => response("not json");
  try {
    await assert.rejects(
      runChain(c, "chain", 1, "path", Buffer.from("x"), "image/png"),
      /caption strings/,
    );
    assert.ok(!c.calls.some((c) => c.name === "studio_finish_generation"));
  } finally {
    global.fetch = original;
  }
});
test("stale version is rejected before any provider call", async () => {
  const c = client({ code: "40001", message: "Chain changed" });
  const original = global.fetch;
  global.fetch = async () => {
    throw Error("provider should not be called");
  };
  try {
    await assert.rejects(
      runChain(c, "chain", 1, "path", Buffer.from("x"), "image/png"),
      (e) => e.status === 409,
    );
  } finally {
    global.fetch = original;
  }
});

test("one transient network failure retries the same step and completes", async () => {
  const c = client();
  const original = global.fetch;
  let count = 0;
  global.fetch = async () => {
    count++;
    if (count === 1) throw Error("Transient network failure");
    return response(
      count === 4
        ? JSON.stringify({ captions: ["one", "two", "three", "four", "five"] })
        : "intermediate output",
    );
  };
  try {
    await runChain(c, "chain", 1, "path", Buffer.from("x"), "image/png");
    assert.equal(count, 4);
    assert.equal(
      c.calls.filter((c) => c.name === "admin_log_response").length,
      4,
    );
    assert.equal(
      c.calls.find((c) => c.name === "studio_finish_generation").args
        .output_captions.length,
      5,
    );
  } finally {
    global.fetch = original;
  }
});
