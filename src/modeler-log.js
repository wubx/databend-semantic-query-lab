const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

function modelerLogPath() {
  return path.resolve(
    process.env.MODELER_LOG_PATH ||
      path.join(__dirname, "..", "logs", "modeler-observability.jsonl"),
  );
}

async function observeModelGeneration(observation) {
  const record = {
    timestamp: new Date().toISOString(),
    requestId: observation.requestId || crypto.randomUUID(),
    operation: "generate-model-draft",
    status: observation.error ? "error" : "success",
    database: observation.database,
    tables: observation.tables,
    enrichWithLlm: observation.enrichWithLlm,
    aiModel: observation.enrichWithLlm ? process.env.AI_MODEL : null,
    timings: observation.timings,
    drafts: observation.drafts?.map((draft) => ({
      entity: draft.entity.name,
      table: draft.diagnostics.table,
      llmEnriched: Boolean(draft.diagnostics.llmEnriched),
      llmFallback: Boolean(draft.diagnostics.llmFallback),
      warnings:
        draft.diagnostics.llmWarnings || draft.diagnostics.warnings || [],
    })),
    error: observation.error?.message || undefined,
  };
  const filePath = modelerLogPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
  return record;
}

module.exports = { modelerLogPath, observeModelGeneration };
