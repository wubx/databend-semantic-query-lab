const assert = require("node:assert/strict");
const test = require("node:test");

const { compileVerifiedQueries } = require("../src/compiler");
const { loadManifest } = require("../src/manifest");
const { exactCertifiedPlan } = require("../src/router");

const verifiedQueries = compileVerifiedQueries(loadManifest());

for (const definition of verifiedQueries) {
  test(`verified query ${definition.id}: ${definition.question}`, () => {
    const plan = exactCertifiedPlan(definition.question, definition.route);
    assert.ok(
      plan,
      `expected ${definition.id} to match its canonical question`,
    );
    assert.equal(plan.queryId, definition.id);
    assert.equal(plan.confidence, 1);
    assert.deepEqual(plan.cubeQuery, definition.cubeQuery);
  });
}
