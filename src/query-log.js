const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const DEFAULT_LOG_PATH = path.join(
  __dirname,
  "..",
  "logs",
  "query-observability.jsonl",
);
let writeQueue = Promise.resolve();

function isQueryLogEnabled() {
  return process.env.QUERY_LOG_ENABLED !== "false";
}

function queryLogPath() {
  return path.resolve(process.env.QUERY_LOG_PATH || DEFAULT_LOG_PATH);
}

function createObservation({ operation, request, plan, response, error }) {
  return compact({
    timestamp: new Date().toISOString(),
    requestId: response?.requestId || randomUUID(),
    operation,
    status: error
      ? "error"
      : plan?.supported === false
        ? "rejected"
        : "success",
    question: request?.question ?? null,
    requestedMode: request?.mode || undefined,
    requestedPlanner: request?.planner || undefined,
    route: plan?.route,
    queryId: plan?.queryId,
    strategy: plan?.strategy,
    planner: plan?.planner,
    sqlOrigin: plan?.sqlOrigin,
    policy: plan?.policy,
    confidence: plan?.confidence,
    queryUnderstanding: plan?.queryUnderstanding,
    queryParameters: plan?.queryParameters,
    fallback: plan?.fallback,
    rejection:
      plan?.supported === false
        ? {
            message: plan.message,
            reason: plan.reason || plan.message,
            source: plan.planner || plan.queryUnderstanding?.method,
            category: plan.rejectionDiagnostics?.category || "unclassified",
            missingMembers: plan.rejectionDiagnostics?.missingMembers || [],
            affectedEntities: plan.rejectionDiagnostics?.affectedEntities || [],
            suggestedActions: plan.rejectionDiagnostics?.suggestedActions || [],
            yamlCandidates: yamlCandidates(plan.rejectionDiagnostics),
          }
        : undefined,
    cubeQuery: plan?.cubeQuery,
    workflow: plan?.workflow,
    semanticGateway: plan?.semanticGateway,
    sql: plan?.sql,
    sqlValues: plan?.sqlValues,
    validation: plan?.validation,
    timings: compact({
      ...plan?.timings,
      planningMs: response?.timings?.planningMs,
      explainMs: response?.timings?.explainMs,
      queryMs: response?.timings?.queryMs,
      summaryMs: response?.timings?.summaryMs,
      totalRequestMs: response?.timings?.totalMs,
    }),
    result: response
      ? {
          source: response.source,
          rowCount: Array.isArray(response.data)
            ? response.data.length
            : undefined,
          summary: response.summary,
          workflow: response.workflow,
        }
      : undefined,
    error: error ? error.message || String(error) : undefined,
  });
}

async function listQueryObservations({
  limit = 100,
  status,
  sqlOrigin,
  search,
} = {}) {
  const requestedLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const records = await readRecentJsonLines(queryLogPath(), 2 * 1024 * 1024);
  const normalizedSearch = String(search || "")
    .trim()
    .toLowerCase();
  const filtered = records
    .filter((item) => !status || item.status === status)
    .filter((item) => !sqlOrigin || item.sqlOrigin === sqlOrigin)
    .filter(
      (item) =>
        !normalizedSearch ||
        [
          item.question,
          item.queryId,
          item.sql,
          item.error,
          item.rejection?.message,
          item.rejection?.reason,
          item.rejection?.category,
          ...(item.rejection?.missingMembers || []),
          ...(item.rejection?.affectedEntities || []),
          ...(item.rejection?.suggestedActions || []),
          item.fallback?.from,
          item.fallback?.reason,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch),
    );
  const observations = filtered.slice(-requestedLimit).reverse();
  return {
    observations,
    stats: summarizeObservations(records),
    windowSize: records.length,
    matched: filtered.length,
    logFile: path.basename(queryLogPath()),
  };
}

async function readRecentJsonLines(filePath, maxBytes) {
  let handle;
  try {
    handle = await fs.open(filePath, "r");
    const { size } = await handle.stat();
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    let text = buffer.toString("utf8");
    if (size > length) text = text.slice(text.indexOf("\n") + 1);
    return text
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  } finally {
    await handle?.close();
  }
}

function summarizeObservations(records) {
  const executed = records.filter((item) =>
    ["execute", "execute-sql"].includes(item.operation),
  );
  const freeSql = records.filter(
    (item) => item.policy?.usedAllowFreeSql === true,
  );
  const fallback = records.filter((item) => item.fallback?.reason);
  return {
    total: records.length,
    fallbacks: fallback.length,
    llmTimeouts: fallback.filter((item) =>
      isTimeoutReason(item.fallback.reason),
    ).length,
    executed: executed.length,
    success: records.filter((item) => item.status === "success").length,
    errors: records.filter((item) => item.status === "error").length,
    rejected: records.filter((item) => item.status === "rejected").length,
    freeSql: freeSql.length,
    freeSqlAllowed: freeSql.filter(
      (item) => item.policy?.decision === "allowed",
    ).length,
    freeSqlDenied: freeSql.filter((item) => item.policy?.decision === "denied")
      .length,
  };
}

function yamlCandidates(diagnostics) {
  if (!diagnostics) return [];
  const files = (diagnostics.affectedEntities || []).flatMap((entity) => {
    const normalized = String(entity)
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .replace(/[^A-Za-z0-9-]/g, "-")
      .toLowerCase();
    return normalized ? [`semantic/entities/${normalized}.yaml`] : [];
  });
  if (diagnostics.category === "relationship-gap")
    files.push("semantic/relationships.yaml");
  if (diagnostics.category === "policy") files.push("semantic/policy.yaml");
  files.push("semantic/verified-queries.yaml");
  return [...new Set(files)];
}

function isTimeoutReason(reason) {
  return /timeout|timed out|aborted due to timeout/i.test(String(reason || ""));
}

async function writeQueryObservation(observation) {
  if (!isQueryLogEnabled()) return;
  const logPath = queryLogPath();
  const line = `${JSON.stringify(observation)}\n`;
  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      await fs.mkdir(path.dirname(logPath), { recursive: true });
      await fs.appendFile(logPath, line, "utf8");
    });
  return writeQueue;
}

async function observeQuery(input) {
  const observation = createObservation(input);
  try {
    await writeQueryObservation(observation);
  } catch (error) {
    console.warn(`Query observation log unavailable: ${error.message}`);
  }
  return observation;
}

function compact(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}

module.exports = {
  DEFAULT_LOG_PATH,
  createObservation,
  isQueryLogEnabled,
  listQueryObservations,
  observeQuery,
  queryLogPath,
  writeQueryObservation,
};
