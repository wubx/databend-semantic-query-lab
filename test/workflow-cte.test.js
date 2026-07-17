const test = require("node:test");
const assert = require("node:assert/strict");

const { fuseWorkflowToCte } = require("../src/workflow-cte");

function compiledWorkflow() {
  return {
    stages: [
      {
        id: "top_orders",
        role: "parent",
        query: {
          dimensions: ["Orders.orderKey", "Orders.orderTotal"],
          order: { "Orders.orderTotal": "desc" },
          limit: 100,
          ungrouped: true,
        },
        exportMember: "Orders.orderKey",
      },
      {
        id: "details",
        role: "detail",
        query: {
          dimensions: ["LineItem.orderKey", "Orders.orderTotal", "Part.name"],
          filters: [
            {
              member: "LineItem.orderKey",
              operator: "equals",
              values: ["__workflow_key__"],
            },
          ],
          limit: 1000,
          ungrouped: true,
        },
        binding: {
          targetMember: "LineItem.orderKey",
        },
        sql: 'SELECT "line_item".l_orderkey "line_item__order_key", "orders".o_totalprice "orders__order_total", "part".p_name "part__name"\nFROM tpch_100.lineitem AS "line_item"\nLEFT JOIN tpch_100.orders AS "orders" ON "line_item".l_orderkey = "orders".o_orderkey\nLEFT JOIN tpch_100.part AS "part" ON "line_item".l_partkey = "part".p_partkey\nWHERE ("line_item".l_orderkey = ?)\nLIMIT 1000',
      },
    ],
  };
}

test("fuses a safe parent Top N workflow into one CTE SQL", () => {
  const fused = fuseWorkflowToCte(compiledWorkflow());
  assert.equal(fused.mode, "fused-cte");
  assert.match(fused.sql, /^WITH workflow_top_orders AS/);
  assert.match(
    fused.sql,
    /ORDER BY "orders_workflow_parent"\.o_totalprice DESC/,
  );
  assert.match(fused.sql, /LIMIT 100/);
  assert.match(fused.sql, /INNER JOIN workflow_top_orders AS "orders"/);
  assert.doesNotMatch(fused.sql, /LEFT JOIN workflow_top_orders/);
  assert.doesNotMatch(fused.sql, /l_orderkey = \?/);
  assert.deepEqual(fused.sqlValues, []);
});

test("does not fuse workflows with extra detail filters", () => {
  const workflow = compiledWorkflow();
  workflow.stages[1].query.filters.push({
    member: "LineItem.shipMode",
    operator: "equals",
    values: ["AIR"],
  });
  assert.equal(fuseWorkflowToCte(workflow), null);
});
