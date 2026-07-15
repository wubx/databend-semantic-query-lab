require('dotenv').config();

const path = require('node:path');
const express = require('express');

const { listQueries } = require('./catalog');
const { cubeHealth, executeCube } = require('./cube');
const { explainDatabend, queryDatabend } = require('./databend');
const { isEnabled, summarizeWithLlm } = require('./llm');
const { createPlan } = require('./planner');
const { validateSql } = require('./sql-safety');

const app = express();
const port = Number(process.env.PORT || 4100);

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', async (_req, res) => {
  const checks = { api: { ok: true }, cube: { ok: false }, databend: { ok: false } };
  await Promise.all([
    cubeHealth().then((value) => { checks.cube = value; }).catch((error) => { checks.cube.error = error.message; }),
    queryDatabend('SELECT 1 AS value').then(() => { checks.databend.ok = true; }).catch((error) => { checks.databend.error = error.message; }),
  ]);
  const ok = Object.values(checks).every((check) => check.ok);
  res.status(ok ? 200 : 503).json({
    ok,
    checks,
    aiEnabled: isEnabled(),
    aiModel: isEnabled() ? process.env.AI_MODEL : null,
  });
});

app.get('/api/query/examples', (_req, res) => res.json({ queries: listQueries() }));

app.post('/api/query/plan', asyncHandler(async (req, res) => {
  res.json(await createPlan(req.body || {}));
}));

app.post('/api/query/validate', asyncHandler(async (req, res) => {
  res.json(validateSql(req.body?.sql));
}));

app.post('/api/query/explain', asyncHandler(async (req, res) => {
  const validation = validateSql(req.body?.sql, { allowExplain: false });
  if (!validation.valid) return res.status(400).json(validation);
  const startedAt = Date.now();
  const rows = await explainDatabend(validation.sql);
  return res.json({ validation, rows, durationMs: Date.now() - startedAt });
}));

app.post('/api/query/execute', asyncHandler(async (req, res) => {
  const plan = await createPlan(req.body || {});
  if (!plan.supported) return res.status(422).json(plan);
  if (!plan.validation.valid) return res.status(400).json(plan);

  const startedAt = Date.now();
  if (plan.route === 'semantic') {
    const result = await executeCube(plan.cubeQuery);
    const response = {
      plan,
      data: result.data,
      annotation: result.annotation,
      durationMs: Date.now() - startedAt,
      source: 'Cube semantic query',
      requestId: result.requestId,
    };
    response.summary = await safeSummary(req.body?.question, plan, response.data);
    return res.json(response);
  }

  await explainDatabend(plan.sql);
  const rows = await queryDatabend(plan.sql);
  const response = {
    plan,
    data: rows.slice(0, Number(process.env.RESULT_ROW_LIMIT || 500)),
    durationMs: Date.now() - startedAt,
    source: 'Certified TPC-H SQL',
  };
  response.summary = await safeSummary(req.body?.question, plan, response.data);
  return res.json(response);
}));

app.get('*splat', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || String(error) });
});

app.listen(port, () => {
  console.log(`Databend Semantic SQL Demo is listening on http://localhost:${port}`);
});

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

async function safeSummary(question, plan, data) {
  try {
    return await summarizeWithLlm({ question, plan, data });
  } catch (error) {
    console.warn(`AI summary unavailable: ${error.message}`);
    return null;
  }
}
