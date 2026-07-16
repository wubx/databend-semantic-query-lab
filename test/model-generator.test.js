const test = require("node:test");
const assert = require("node:assert/strict");

const { generateEntityDraft } = require("../src/model-generator");
const { applyEnrichment } = require("../src/model-enricher");

const table = {
  catalog: "default",
  database: "sales",
  name: "orders",
  columns: [
    { name: "o_orderkey", dataType: "BIGINT", nullable: false },
    { name: "o_orderdate", dataType: "DATE", nullable: false },
    { name: "o_status", dataType: "VARCHAR", nullable: false },
    { name: "o_totalprice", dataType: "DECIMAL(18,2)", nullable: false },
  ],
};

test("generates a review-only semantic entity draft from Databend metadata", () => {
  const draft = generateEntityDraft(table);
  assert.equal(draft.entity.name, "Order");
  assert.equal(draft.entity.keys.primary, "orderkey");
  assert.equal(draft.entity.governance.status, "draft");
  assert.equal(draft.entity.governance.requires_human_review, true);
  assert.ok(
    draft.entity.time_dimensions.some((member) => member.name === "orderdate"),
  );
  assert.ok(draft.entity.facts.some((member) => member.name === "totalprice"));
  assert.ok(
    draft.entity.metrics.some((member) => member.name === "totalTotalprice"),
  );
});

test("LLM enrichment cannot alter technical model fields", () => {
  const draft = generateEntityDraft(table);
  const enriched = applyEnrichment(draft, {
    entity: { title: "订单", description: "客户订单" },
    members: {
      totalprice: {
        title: "订单金额",
        description: "订单记录金额",
        business_definition: "待业务确认的订单金额候选。",
        synonyms: ["销售额", "GMV"],
        expr: "malicious_column",
        type: "count",
      },
    },
    warnings: ["需要确认币种"],
  });
  const member = enriched.entity.facts.find(
    (item) => item.name === "totalprice",
  );
  assert.equal(member.expr, "o_totalprice");
  assert.equal(member.type, "decimal");
  assert.equal(member.title, "订单金额");
  assert.deepEqual(member.synonyms, ["销售额", "GMV"]);
  assert.deepEqual(enriched.diagnostics.llmWarnings, ["需要确认币种"]);
});
