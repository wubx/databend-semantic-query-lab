const { ProxyAgent } = require('undici');
const { getQuery, listQueries } = require('./catalog');

const VALID_MODES = new Set(['auto', 'semantic', 'tpch']);

function isEnabled() {
  return process.env.AI_ENABLED === 'true' && Boolean(process.env.AI_API_KEY);
}

async function planWithLlm(question, mode = 'auto') {
  if (!isEnabled()) throw new Error('AI planner is disabled');
  if (!VALID_MODES.has(mode)) throw new Error(`Unsupported mode: ${mode}`);

  const catalog = listQueries()
    .filter((query) => mode === 'auto' || query.route === mode)
    .map(({ id, route, title, description, examples, parameters }) => ({
      id, route, title, description, examples, defaultParameters: parameters,
    }));
  const response = await requestCompletion([
    {
      role: 'system',
      content: [
        'You are a strict query router for a Cube and Databend demo.',
        'Select exactly one certified query from the supplied catalog, or reject the request.',
        'Never generate SQL and never invent a query ID.',
        'For Q6, extract only startDate, endDate, discountMin, discountMax, and quantity.',
        'Percentages must be decimal numbers: 5% becomes 0.05.',
        'Return JSON only with this shape:',
        '{"supported":boolean,"queryId":string|null,"confidence":number,"parameters":object,"reason":string}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({ mode, question, certifiedQueryCatalog: catalog }),
    },
  ]);
  return validateLlmPlan(response, question, mode);
}

async function summarizeWithLlm({ question, plan, data }) {
  if (!isEnabled() || !Array.isArray(data) || !data.length) return null;
  const limitedData = data.slice(0, 20);
  const response = await requestCompletion([
    {
      role: 'system',
      content: '用简洁中文总结真实查询结果。只能使用提供的数据，不得推测或编造。返回 JSON：{"summary":"..."}。',
    },
    {
      role: 'user',
      content: JSON.stringify({ question, queryId: plan.queryId, data: limitedData }),
    },
  ]);
  return typeof response.summary === 'string' ? response.summary : null;
}

async function requestCompletion(messages) {
  const baseUrl = String(process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const endpoint = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
  const timeout = Number(process.env.AI_REQUEST_TIMEOUT_MS || 30000);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.AI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'gpt-4.1-mini',
      messages,
      temperature: 0,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    }),
    dispatcher: proxyDispatcher(endpoint),
    signal: AbortSignal.timeout(timeout),
  });
  const body = await response.json();
  if (!response.ok || body.error) {
    throw new Error(body.error?.message || `AI provider returned HTTP ${response.status}`);
  }
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI provider returned an empty response');
  try {
    return JSON.parse(content);
  } catch {
    throw new Error('AI provider did not return valid JSON');
  }
}

function proxyDispatcher(endpoint) {
  const hostname = new URL(endpoint).hostname;
  const noProxy = String(process.env.NO_PROXY || process.env.no_proxy || '')
    .split(',').map((item) => item.trim()).filter(Boolean);
  if (noProxy.some((item) => hostname === item || hostname.endsWith(`.${item}`))) return undefined;
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  return proxy ? new ProxyAgent(proxy) : undefined;
}

function validateLlmPlan(result, question, mode) {
  if (result.supported === false) {
    return {
      supported: false,
      question,
      mode,
      planner: 'llm',
      message: result.reason || 'AI planner could not map this request to a certified query.',
    };
  }
  const definition = getQuery(String(result.queryId || '').toUpperCase());
  if (!definition) throw new Error('AI planner selected an unknown certified query');
  if (mode !== 'auto' && definition.route !== mode) throw new Error('AI planner selected a query outside the requested mode');

  const parameters = definition.id === 'Q6'
    ? validateQ6Parameters({ ...definition.parameters, ...(result.parameters || {}) })
    : { ...(definition.parameters || {}) };
  return {
    supported: true,
    question,
    route: definition.route,
    queryId: definition.id,
    title: definition.title,
    description: definition.description,
    confidence: clamp(Number(result.confidence) || 0.8, 0, 1),
    planner: 'llm',
    reason: result.reason,
    parameters,
    cubeQuery: definition.cubeQuery,
  };
}

function validateQ6Parameters(parameters) {
  const allowed = new Set(['startDate', 'endDate', 'discountMin', 'discountMax', 'quantity']);
  const result = {};
  for (const [key, value] of Object.entries(parameters)) {
    if (!allowed.has(key)) continue;
    if ((key === 'startDate' || key === 'endDate') && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      throw new Error(`AI planner returned an invalid ${key}`);
    }
    if (key.startsWith('discount') && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1)) {
      throw new Error(`AI planner returned an invalid ${key}`);
    }
    if (key === 'quantity' && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1000000)) {
      throw new Error('AI planner returned an invalid quantity');
    }
    result[key] = key === 'startDate' || key === 'endDate' ? String(value) : Number(value);
  }
  return result;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

module.exports = { isEnabled, planWithLlm, summarizeWithLlm, validateLlmPlan };
