const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { observeModelGeneration } = require("../src/modeler-log");

test("writes model-generation stage timings and LLM fallback evidence", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "modeler-log-"));
  const previous = process.env.MODELER_LOG_PATH;
  process.env.MODELER_LOG_PATH = path.join(directory, "modeler.jsonl");
  try {
    await observeModelGeneration({
      requestId: "modeler-1",
      database: "tpch_100",
      tables: ["orders"],
      enrichWithLlm: true,
      timings: { catalogMs: 10, generationMs: 2, llmMs: 90001, totalMs: 90013 },
      drafts: [
        {
          entity: { name: "Order" },
          diagnostics: {
            table: "tpch_100.orders",
            llmFallback: true,
            llmWarnings: ["LLM timeout"],
          },
        },
      ],
    });
    const record = JSON.parse(
      await fs.readFile(process.env.MODELER_LOG_PATH, "utf8"),
    );
    assert.equal(record.operation, "generate-model-draft");
    assert.equal(record.timings.llmMs, 90001);
    assert.equal(record.drafts[0].llmFallback, true);
  } finally {
    if (previous === undefined) delete process.env.MODELER_LOG_PATH;
    else process.env.MODELER_LOG_PATH = previous;
  }
});
