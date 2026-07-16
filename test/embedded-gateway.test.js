const test = require("node:test");
const assert = require("node:assert/strict");

const {
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
  assert.equal(query.timezone, "UTC");
  assert.deepEqual(query.filters, []);
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
