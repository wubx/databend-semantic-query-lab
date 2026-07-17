const test = require("node:test");
const assert = require("node:assert/strict");

const {
  listEvolutionIssues,
  setEvolutionIssueStatus,
} = require("../src/semantic-evolution");
const { writeQueryObservation } = require("../src/query-log");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

test("groups rejected observations into semantic evolution issues", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "semantic-evolution-"),
  );
  const previousPath = process.env.QUERY_LOG_PATH;
  const previousEvolutionPath = process.env.SEMANTIC_EVOLUTION_LOG_PATH;
  process.env.QUERY_LOG_PATH = path.join(directory, "queries.jsonl");
  process.env.SEMANTIC_EVOLUTION_LOG_PATH = path.join(
    directory,
    "evolution.jsonl",
  );
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
    assert.equal(result.stats.resolvedIssues, 0);
    assert.equal(result.issues[0].count, 2);
    assert.deepEqual(result.issues[0].questions.sort(), [
      "不同区域喜欢哪些运输方式",
      "区域运输偏好是什么",
    ]);
    await setEvolutionIssueStatus(
      result.issues[0].id,
      "resolved",
      "已新增指标",
    );
    const resolved = await listEvolutionIssues();
    assert.equal(resolved.stats.issueCount, 0);
    assert.equal(resolved.stats.resolvedIssues, 1);
    assert.equal(resolved.issues[0].resolved, true);
    assert.equal(resolved.issues[0].resolution.note, "已新增指标");
  } finally {
    if (previousPath === undefined) delete process.env.QUERY_LOG_PATH;
    else process.env.QUERY_LOG_PATH = previousPath;
    if (previousEvolutionPath === undefined)
      delete process.env.SEMANTIC_EVOLUTION_LOG_PATH;
    else process.env.SEMANTIC_EVOLUTION_LOG_PATH = previousEvolutionPath;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
