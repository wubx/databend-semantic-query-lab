const test = require("node:test");
const assert = require("node:assert/strict");

const { loadManifest } = require("../src/manifest");
const { compareMeta } = require("../src/validate-meta");

function fakeMeta(manifest) {
  return {
    cubes: manifest.entities.map((entity) => ({
      name: entity.name,
      measures: (entity.metrics || []).map((member) => ({
        name: `${entity.name}.${member.name}`,
        type: member.type,
      })),
      dimensions: [
        ...(entity.dimensions || []).map((member) => ({
          name: `${entity.name}.${member.name}`,
          type: member.type,
        })),
        ...(entity.facts || []).map((member) => ({
          name: `${entity.name}.${member.name}`,
          type: "number",
        })),
        ...(entity.time_dimensions || []).map((member) => ({
          name: `${entity.name}.${member.name}`,
          type: "time",
        })),
      ],
      segments: (entity.filters || []).map((member) => ({
        name: `${entity.name}.${member.name}`,
      })),
    })),
  };
}

test("matches manifest members against Cube meta", () => {
  const manifest = loadManifest();
  const result = compareMeta(manifest, fakeMeta(manifest));
  assert.equal(result.valid, true);
  assert.equal(result.missing.length, 0);
});

test("reports missing and mismatched Cube members", () => {
  const manifest = loadManifest();
  const meta = fakeMeta(manifest);
  meta.cubes[0].measures = meta.cubes[0].measures.filter(
    (member) => member.name !== "Orders.count",
  );
  const status = meta.cubes[0].dimensions.find(
    (member) => member.name === "Orders.status",
  );
  status.type = "time";
  const result = compareMeta(manifest, meta);
  assert.equal(result.valid, false);
  assert.deepEqual(result.missing, ["Orders.count"]);
  assert.deepEqual(result.mismatched, [
    {
      member: "Orders.status",
      expected: "dimension",
      actual: "time_dimension",
    },
  ]);
});
