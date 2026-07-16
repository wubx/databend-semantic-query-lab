const { compileVerifiedQueries } = require("./compiler");
const { getSemanticGateway } = require("./semantic-gateway");
const { loadManifest } = require("./manifest");
const { validateSql } = require("./sql-safety");

async function verifyRuntime() {
  const definitions = compileVerifiedQueries(loadManifest()).filter(
    (query) => query.route === "semantic",
  );
  const results = [];
  for (const definition of definitions) {
    const startedAt = performance.now();
    try {
      const generated = await getSemanticGateway().compile(
        definition.cubeQuery,
      );
      const validation = validateSql(generated.sql);
      if (!validation.valid)
        throw new Error(`unsafe SQL: ${validation.errors.join("; ")}`);
      const executionStartedAt = performance.now();
      const response = await getSemanticGateway().execute(definition.cubeQuery);
      const rows = response.data || [];
      validateResult(definition, rows);
      results.push({
        id: definition.id,
        status: "passed",
        rows: rows.length,
        planningMs: elapsed(executionStartedAt, startedAt),
        queryMs: elapsed(performance.now(), executionStartedAt),
        totalMs: elapsed(performance.now(), startedAt),
      });
    } catch (error) {
      results.push({
        id: definition.id,
        status: "failed",
        error: error.message,
        totalMs: elapsed(performance.now(), startedAt),
      });
    }
  }
  return results;
}

function validateResult(definition, rows) {
  const expected = definition.expectedResult;
  if (!expected) return;
  if (rows.length < (expected.min_rows || 0))
    throw new Error(
      `expected at least ${expected.min_rows} row(s), got ${rows.length}`,
    );
  const columns = new Set(rows.flatMap(Object.keys));
  const missing = (expected.columns || []).filter(
    (column) => !columns.has(column),
  );
  if (missing.length)
    throw new Error(`missing result column(s): ${missing.join(", ")}`);
}

function elapsed(endedAt, startedAt) {
  return Math.round((endedAt - startedAt) * 10) / 10;
}

if (require.main === module) {
  verifyRuntime()
    .then((results) => {
      console.log(JSON.stringify(results, null, 2));
      if (results.some((result) => result.status !== "passed"))
        process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = { validateResult, verifyRuntime };
