const { getQuery } = require('./catalog');
const { deterministicPlan } = require('./router');
const { getCubeSql } = require('./cube');
const { validateSql } = require('./sql-safety');

async function createPlan({ question, mode = 'auto' }) {
  const plan = deterministicPlan(question, mode);
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
