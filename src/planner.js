const { getQuery } = require("./catalog");
const { isEnabled, planWithLlm } = require("./llm");
const { deterministicPlan, exactCertifiedPlan } = require("./router");
const { getSemanticGateway } = require("./semantic-gateway");
const { validateSql } = require("./sql-safety");

async function createPlan({ question, mode = "auto", planner = "auto" }) {
  const totalStartedAt = performance.now();
  const timings = {};
  let plan;
  const routingStartedAt = performance.now();
  const exactStartedAt = performance.now();
  const exactPlan =
    planner === "auto" ? exactCertifiedPlan(question, mode) : null;
  timings.exactMatchMs = elapsed(exactStartedAt);
  if (exactPlan) {
    plan = exactPlan;
    plan.queryUnderstanding = {
      llmUsed: false,
      method: "certified-exact-match",
    };
  } else if (planner !== "deterministic" && isEnabled()) {
    const llmStartedAt = performance.now();
    try {
      plan = await planWithLlm(question, mode);
      plan.queryUnderstanding = { llmUsed: true, method: "llm" };
    } catch (error) {
      timings.llmMs = elapsed(llmStartedAt);
      const fallbackStartedAt = performance.now();
      plan = deterministicPlan(question, mode);
      timings.fallbackMs = elapsed(fallbackStartedAt);
      plan.queryUnderstanding = {
        llmUsed: true,
        method: "llm-with-deterministic-fallback",
      };
      plan.fallback = {
        from: "llm",
        reason: error.message,
      };
    }
    timings.llmMs ??= elapsed(llmStartedAt);
  } else {
    const deterministicStartedAt = performance.now();
    plan = deterministicPlan(question, mode);
    plan.queryUnderstanding = {
      llmUsed: false,
      method: "deterministic",
    };
    timings.deterministicMs = elapsed(deterministicStartedAt);
  }
  timings.routingMs = elapsed(routingStartedAt);
  if (!plan.supported) {
    timings.totalMs = elapsed(totalStartedAt);
    plan.timings = timings;
    return plan;
  }
  plan.queryParameters = collectQueryParameters(plan);

  const sqlStartedAt = performance.now();
  if (plan.route === "semantic") {
    const generated = await getSemanticGateway().compile(plan.cubeQuery);
    plan.sql = generated.sql;
    plan.sqlValues = generated.values;
    plan.semanticGateway = generated.gateway;
  } else {
    plan.sql = getQuery(plan.queryId).buildSql(plan.parameters);
    plan.sqlValues = [];
  }
  timings.sqlGenerationMs = elapsed(sqlStartedAt);

  const validationStartedAt = performance.now();
  plan.validation = validateSql(plan.sql);
  timings.validationMs = elapsed(validationStartedAt);
  timings.totalMs = elapsed(totalStartedAt);
  plan.timings = timings;
  return plan;
}

function collectQueryParameters(plan) {
  const result = { ...(plan.parameters || {}) };
  const query = plan.cubeQuery;
  if (!query) return result;
  if (query.timeDimensions?.length) {
    result.timeDimensions = query.timeDimensions.map((item) => ({
      dimension: item.dimension,
      granularity: item.granularity,
      dateRange: item.dateRange,
    }));
  }
  if (query.filters?.length) result.filters = query.filters;
  if (query.segments?.length) result.segments = query.segments;
  if (query.limit !== undefined) result.limit = query.limit;
  if (query.timezone) result.timezone = query.timezone;
  return result;
}

function elapsed(startedAt) {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

module.exports = { createPlan };
