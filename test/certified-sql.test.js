const test = require("node:test");
const assert = require("node:assert/strict");

const {
  compileTemplate,
  getCertifiedSqlAsset,
  getCertifiedSqlQuery,
  listCertifiedSqlQueries,
  validateCertifiedSqlAsset,
} = require("../src/certified-sql");

test("loads certified SQL assets from YAML and SQL files", () => {
  assert.deepEqual(
    listCertifiedSqlQueries().map((query) => query.id),
    ["Q1", "Q6", "Q21"],
  );
  const q1 = getCertifiedSqlAsset("q1");
  assert.match(q1.sql, /FROM tpch_100\.lineitem/);
  assert.equal(q1.parameters.days.default, 90);
});

test("compiles typed certified SQL parameters", () => {
  const q6 = getCertifiedSqlQuery("Q6");
  const sql = q6.buildSql({
    startDate: "1995-01-01",
    endDate: "1996-01-01",
    discountMin: 0.04,
    discountMax: 0.06,
    quantity: 20,
  });
  assert.match(sql, /DATE '1995-01-01'/);
  assert.match(sql, /BETWEEN 0\.04 AND 0\.06/);
  assert.match(sql, /l_quantity < 20/);
});

test("rejects undeclared, invalid, and unsafe certified SQL", () => {
  assert.throws(
    () => compileTemplate("SELECT {{missing}}", {}, {}),
    /未声明参数/,
  );
  const q1 = getCertifiedSqlAsset("Q1");
  assert.throws(
    () =>
      validateCertifiedSqlAsset({
        ...q1,
        parameters: {
          days: { ...q1.parameters.days, default: 5000 },
        },
      }),
    /大于最大值/,
  );
  assert.throws(
    () =>
      validateCertifiedSqlAsset({
        ...q1,
        sql: "DROP TABLE tpch_100.orders WHERE 1 = {{days}}",
      }),
    /SQL 安全校验失败/,
  );
});
