const fs = require("node:fs");

const { queryLogPath } = require("./query-log");

function buildReport(observations) {
  const records = observations.filter(Boolean);
  const executionRecords = records.filter((item) => item.operation !== "plan");
  return {
    requests: records.length,
    executions: executionRecords.length,
    status: countBy(records, (item) => item.status || "unknown"),
    routes: countBy(records, (item) => item.route || "unknown"),
    queryIds: countBy(records, (item) => item.queryId || "unknown"),
    llmUsageRate: ratio(
      records.filter((item) => item.queryUnderstanding?.llmUsed).length,
      records.length,
    ),
    certifiedHitRate: ratio(
      records.filter((item) => item.queryId && item.queryId !== "DYNAMIC")
        .length,
      records.length,
    ),
    dynamicRate: ratio(
      records.filter((item) => item.queryId === "DYNAMIC").length,
      records.length,
    ),
    executionGateways: countBy(executionRecords, executionGateway),
    latencyMs: {
      planning: percentiles(records.map((item) => item.timings?.totalMs)),
      llm: percentiles(records.map((item) => item.timings?.llmMs)),
      query: percentiles(records.map((item) => item.timings?.queryMs)),
      summary: percentiles(records.map((item) => item.timings?.summaryMs)),
      totalRequest: percentiles(
        records.map((item) => item.timings?.totalRequestMs),
      ),
    },
    unsupportedQuestions: countBy(
      records.filter((item) => item.status === "rejected"),
      (item) => item.question || "(empty)",
    ),
  };
}

function executionGateway(item) {
  const source = item.result?.source || "";
  return /Cube|semantic|Embedded/i.test(source) ? "cube" : "databend-direct";
}

function percentiles(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return { count: 0, p50: null, p95: null, p99: null };
  return {
    count: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
  };
}

function percentile(sorted, value) {
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)
  ];
}

function countBy(items, key) {
  return Object.fromEntries(
    [
      ...items.reduce((map, item) => {
        const value = key(item);
        map.set(value, (map.get(value) || 0) + 1);
        return map;
      }, new Map()),
    ].sort((a, b) => b[1] - a[1]),
  );
}

function ratio(value, total) {
  return total ? Math.round((value / total) * 1000) / 10 : 0;
}

function readObservations(filePath = queryLogPath()) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`Invalid JSONL at line ${index + 1}`);
      }
    });
}

if (require.main === module) {
  const report = buildReport(readObservations(process.argv[2]));
  console.log(JSON.stringify(report, null, 2));
}

module.exports = { buildReport, percentiles, readObservations };
