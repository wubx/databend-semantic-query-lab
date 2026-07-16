const test = require("node:test");
const assert = require("node:assert/strict");

const {
  listSemanticSourceFiles,
  readSemanticSourceFile,
} = require("../src/semantic-source-files");

test("lists modular semantic source files and compiled runtime manifest", () => {
  const files = listSemanticSourceFiles();
  assert.equal(files[0].id, "compiled");
  assert.ok(files.some((file) => file.id === "entities/orders.yaml"));
  assert.ok(files.some((file) => file.id === "relationships.yaml"));
  assert.ok(files.some((file) => file.id === "verified-queries.yaml"));
});

test("reads only allowlisted semantic files", () => {
  const orders = readSemanticSourceFile("entities/orders.yaml");
  assert.match(orders.content, /name: Orders/);
  const compiled = readSemanticSourceFile("compiled");
  assert.match(compiled.content, /verified_queries:/);
  assert.throws(
    () => readSemanticSourceFile("../.env"),
    /Unknown semantic source file/,
  );
});
