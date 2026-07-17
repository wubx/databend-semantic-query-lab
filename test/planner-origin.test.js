const test = require("node:test");
const assert = require("node:assert/strict");

const { createPlan } = require("../src/planner");

test("marks semantic and certified plans with their SQL origin", async () => {
  const semantic = await createPlan({
    question: "订单总数是多少？",
    mode: "semantic",
    planner: "deterministic",
  });
  assert.equal(semantic.sqlOrigin, "cube-generated");

  const certified = await createPlan({
    question: "执行 TPC-H Q1 定价汇总报表。",
    mode: "tpch",
    planner: "deterministic",
  });
  assert.equal(certified.sqlOrigin, "certified-sql");
});
