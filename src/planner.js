const { getQuery } = require('./catalog');
const { isEnabled, planWithLlm } = require('./llm');
const { deterministicPlan } = require('./router');
const { getCubeSql } = require('./cube');
const { validateSql } = require('./sql-safety');

async function createPlan({ question, mode = 'auto', planner = 'auto' }) {
  let plan;
  if (planner !== 'deterministic' && isEnabled()) {
    try {
      plan = await planWithLlm(question, mode);
    } catch (error) {
      plan = deterministicPlan(question, mode);
      plan.fallback = {
        from: 'llm',
        reason: error.message,
      };
    }
  } else {
    plan = deterministicPlan(question, mode);
  }
  if (!plan.supported) return plan;

  if (plan.route === 'semantic') {
    const generated = await getCubeSql(plan.cubeQuery);
    plan.sql = generated.sql;
    plan.sqlValues = generated.values;
  } else {
    plan.sql = getQuery(plan.queryId).buildSql(plan.parameters);
    plan.sqlValues = [];
  }
  plan.validation = validateSql(plan.sql);
  return plan;
}

module.exports = { createPlan };
