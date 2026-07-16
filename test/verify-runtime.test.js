const test = require("node:test");
const assert = require("node:assert/strict");

const { validateResult } = require("../src/verify-runtime");

test("validates representative runtime result evidence", () => {
  const definition = {
    expectedResult: {
      columns: ["Orders.status", "Orders.totalPrice"],
      min_rows: 1,
    },
  };
  assert.doesNotThrow(() =>
    validateResult(definition, [
      { "Orders.status": "F", "Orders.totalPrice": "100" },
    ]),
  );
  assert.throws(
    () => validateResult(definition, [{ "Orders.status": "F" }]),
    /missing result column/,
  );
});
