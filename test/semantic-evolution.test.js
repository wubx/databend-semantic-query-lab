const test = require("node:test");
const assert = require("node:assert/strict");

const { listEvolutionIssues } = require("../src/semantic-evolution");
const { writeQueryObservation } = require("../src/query-log");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

test("groups rejected observations into semantic evolution issues", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "semantic-evolution-"),
  );
  const previousPath = process.env.QUERY_LOG_PATH;
  process.env.QUERY_LOG_PATH = path.join(directory, "queries.jsonl");
  try {
    for (const question of ["区域运输偏好是什么", "不同区域喜欢哪些运输方式"]) {
      await writeQueryObservation({
        timestamp: "2026-01-01T00:00:00Z",
        status: "rejected",
        question,
        rejection: {
          category: "semantic-gap",
          reason: "missing regional shipping share",
          affectedEntities: ["Region", "LineItem"],
          missingMembers: ["RegionalShipping.regionalLineShare"],
          suggestedActions: ["add governed share"],
          yamlCandidates: ["semantic/entities/regional-shipping.yaml"],
        },
      });
    }
    const result = await listEvolutionIssues();
    assert.equal(result.stats.rejectedRecords, 2);
    assert.equal(result.stats.issueCount, 1);
    assert.equal(result.issues[0].count, 2);
    assert.deepEqual(result.issues[0].questions.sort(), [
      "不同区域喜欢哪些运输方式",
      "区域运输偏好是什么",
    ]);
  } finally {
    if (previousPath === undefined) delete process.env.QUERY_LOG_PATH;
    else process.env.QUERY_LOG_PATH = previousPath;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
