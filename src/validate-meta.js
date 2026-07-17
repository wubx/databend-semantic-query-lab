const { cubeUrl } = require("./cube");
const { compileMemberCatalog } = require("./compiler");
const { loadManifest } = require("./manifest");

async function validateCubeMeta(manifest = loadManifest()) {
  const response = await fetch(cubeUrl("meta"), {
    headers: process.env.CUBE_API_TOKEN
      ? { Authorization: process.env.CUBE_API_TOKEN }
      : {},
    signal: AbortSignal.timeout(
      Number(process.env.CUBE_META_TIMEOUT_MS || 30000),
    ),
  });
  const body = await response.json();
  if (!response.ok || body.error)
    throw new Error(
      body.error || `Cube /meta returned HTTP ${response.status}`,
    );
  return compareMeta(manifest, body);
}

function compareMeta(manifest, meta) {
  const expected = compileMemberCatalog(manifest).members.filter(
    (member) => member.public,
  );
  const actual = new Map();
  for (const cube of meta.cubes || []) {
    for (const measure of cube.measures || [])
      actual.set(measure.name, "measure");
    for (const dimension of cube.dimensions || [])
      actual.set(
        dimension.name,
        dimension.type === "time" ? "time_dimension" : "dimension",
      );
    for (const segment of cube.segments || [])
      actual.set(segment.name, "filter");
  }
  const missing = [];
  const mismatched = [];
  for (const member of expected) {
    const kind = actual.get(member.member);
    if (!kind) missing.push(member.member);
    else if (
      kind !== member.kind &&
      !(member.kind === "fact" && kind === "dimension")
    )
      mismatched.push({
        member: member.member,
        expected: member.kind,
        actual: kind,
      });
  }
  return {
    valid: !missing.length && !mismatched.length,
    expectedMembers: expected.length,
    matchedMembers: expected.length - missing.length - mismatched.length,
    missing,
    mismatched,
  };
}

if (require.main === module) {
  validateCubeMeta()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.valid) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = { compareMeta, validateCubeMeta };
