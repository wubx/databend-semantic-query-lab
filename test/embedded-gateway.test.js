const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
require("dotenv").config();
process.env.CUBE_REPOSITORY_PATH ||= path.resolve(
  __dirname,
  "..",
  "..",
  "cube",
);

const {
  EmbeddedCompilerGateway,
  normalizeCubeQuery,
  remapRows,
  stripAiOnlyMeta,
} = require("../src/semantic-gateway/embedded");

const { compileCubeModel } = require("../src/compiler");
const { loadManifest } = require("../src/manifest");

test("normalizes Cube Query order, limits, and defaults for embedded compilation", () => {
  const query = normalizeCubeQuery({
    measures: ["Orders.totalPrice"],
    order: { "Orders.totalPrice": "desc" },
    limit: 25,
  });
  assert.deepEqual(query.order, [{ id: "Orders.totalPrice", desc: true }]);
  assert.equal(query.rowLimit, 25);
  assert.equal(query.ungrouped, false);
  assert.equal(query.timezone, "UTC");
  assert.deepEqual(query.filters, []);
});

test("normalizes ungrouped detail queries for embedded compilation", () => {
  const query = normalizeCubeQuery({
    dimensions: ["LineItem.orderKey", "LineItem.lineNumber"],
    ungrouped: true,
    limit: 10,
  });
  assert.equal(query.ungrouped, true);
  assert.equal(query.allowUngroupedWithoutPrimaryKey, true);
  assert.equal(query.rowLimit, 10);
});

test("compiles the real rich LineItem detail shape to SQL", async () => {
  const gateway = new EmbeddedCompilerGateway();
  const dimensions = [
    "LineItem.orderKey",
    "LineItem.lineNumber",
    "LineItem.partKey",
    "LineItem.supplierKey",
    "LineItem.lineStatus",
    "LineItem.returnFlag",
    "LineItem.shipMode",
    "LineItem.shipInstruction",
    "LineItem.shipDate",
    "LineItem.commitDate",
    "LineItem.receiptDate",
    "LineItem.quantity",
    "LineItem.extendedPrice",
    "LineItem.discountRate",
    "LineItem.taxRate",
  ];
  const result = await gateway.compile({
    measures: [],
    dimensions,
    order: { "LineItem.orderKey": "asc", "LineItem.lineNumber": "asc" },
    limit: 10,
    ungrouped: true,
  });
  for (const column of [
    "l_orderkey",
    "l_linenumber",
    "l_shipdate",
    "l_commitdate",
    "l_receiptdate",
    "l_quantity",
    "l_extendedprice",
    "l_discount",
    "l_tax",
  ]) {
    assert.match(result.sql, new RegExp(`\\.${column}\\b`));
  }
  assert.match(result.sql, /ORDER BY\s+1\s+ASC,\s+2\s+ASC/);
  assert.match(result.sql, /LIMIT 10$/);
  assert.equal(Object.keys(result.metadata.aliasNameToMember).length, 15);
});

test("remaps embedded SQL aliases to Cube member names", () => {
  assert.deepEqual(
    remapRows([{ orders__status: "F", orders__total_price: "100" }], {
      orders__status: "Orders.status",
      orders__total_price: "Orders.totalPrice",
    }),
    [{ "Orders.status": "F", "Orders.totalPrice": "100" }],
  );
});

test("strips AI-only metadata before Cube YAML compilation", () => {
  const model = compileCubeModel(loadManifest());
  const stripped = stripAiOnlyMeta(model);
  assert.equal(stripped.cubes[0].dimensions[0].meta, undefined);
  assert.equal(stripped.cubes[0].measures[0].meta, undefined);
});
