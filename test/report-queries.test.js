const test = require("node:test");
const assert = require("node:assert/strict");

const { buildReport, percentiles } = require("../src/report-queries");

test("calculates query observability rates and latency percentiles", () => {
  const report = buildReport([
    {
      operation: "execute",
      status: "success",
      queryId: "S1",
      route: "semantic",
      queryUnderstanding: { llmUsed: false },
      result: { source: "Cube semantic query" },
      timings: { totalMs: 10, queryMs: 20, totalRequestMs: 30 },
    },
    {
      operation: "execute",
      status: "success",
      queryId: "DYNAMIC",
      route: "semantic",
      queryUnderstanding: { llmUsed: true },
      result: { source: "Validated generated SQL via Cube parameter binding" },
      timings: { totalMs: 1000, llmMs: 990, queryMs: 40, totalRequestMs: 1040 },
    },
    {
      operation: "plan",
      status: "rejected",
      question: "delete everything",
      queryUnderstanding: { llmUsed: true },
      timings: { totalMs: 500 },
    },
  ]);
  assert.equal(report.requests, 3);
  assert.equal(report.executions, 2);
  assert.equal(report.llmUsageRate, 66.7);
  assert.equal(report.dynamicRate, 33.3);
  assert.deepEqual(report.executionGateways, { cube: 2 });
  assert.equal(report.latencyMs.planning.p95, 1000);
  assert.deepEqual(report.unsupportedQuestions, { "delete everything": 1 });
});

test("calculates nearest-rank percentiles", () => {
  assert.deepEqual(percentiles([1, 2, 3, 4, 100]), {
    count: 5,
    p50: 3,
    p95: 100,
    p99: 100,
  });
});
