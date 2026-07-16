const { getQuery, listQueries } = require("./catalog");

function normalize(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[，。？！,.?!\s]+/g, "");
}

function extractQ6Parameters(question) {
  const parameters = {};
  const percentRange = question.match(
    /(?:折扣|discount)[^\d]*(\d+(?:\.\d+)?)\s*%?\s*(?:到|至|~|-|和)\s*(\d+(?:\.\d+)?)\s*%?/i,
  );
  if (percentRange) {
    const first = Number(percentRange[1]);
    const second = Number(percentRange[2]);
    const percentNotation =
      question
        .slice(percentRange.index, percentRange.index + percentRange[0].length)
        .includes("%") ||
      first > 1 ||
      second > 1;
    parameters.discountMin = percentNotation ? first / 100 : first;
    parameters.discountMax = percentNotation ? second / 100 : second;
  }

  const quantity = question.match(
    /(?:数量|quantity)[^\d]*(?:小于|少于|<)?\s*(\d+(?:\.\d+)?)/i,
  );
  if (quantity) parameters.quantity = Number(quantity[1]);

  const dates = [...question.matchAll(/(\d{4}-\d{2}-\d{2})/g)].map(
    (match) => match[1],
  );
  if (dates[0]) parameters.startDate = dates[0];
  if (dates[1]) parameters.endDate = dates[1];
  return parameters;
}

function scoreQuery(question, query) {
  const input = normalize(question);
  let score = 0;
  for (const example of [query.question, ...query.examples]) {
    const candidate = normalize(example);
    if (input === candidate) score = Math.max(score, 100);
    else if (input.includes(candidate) || candidate.includes(input))
      score = Math.max(score, 70);
  }

  const id = query.id.toLowerCase();
  if (input.includes(id)) score = Math.max(score, 90);
  if (query.id === "S1" && /订单.*(总数|数量|多少)/.test(question))
    score = Math.max(score, 60);
  if (
    query.id === "S2" &&
    /订单状态|按状态|各状态/.test(question) &&
    /金额|价格|销售额/.test(question)
  )
    score = Math.max(score, 65);
  if (
    query.id === "S3" &&
    /(每月|按月|月度)/.test(question) &&
    /金额|趋势|变化/.test(question)
  )
    score = Math.max(score, 65);
  if (query.id === "Q1" && /定价汇总/.test(question))
    score = Math.max(score, 60);
  if (query.id === "Q6" && /(折扣|收入预测)/.test(question))
    score = Math.max(score, 60);
  if (
    query.id === "Q21" &&
    /(供应商|等待订单)/.test(question) &&
    /(等待|延迟|q21)/i.test(question)
  )
    score = Math.max(score, 60);
  return score;
}

function exactCertifiedPlan(question, mode = "auto") {
  if (!question || !String(question).trim())
    throw new Error("请输入自然语言问题");
  const input = normalize(question);
  const matched = listQueries().find((query) => {
    if (mode !== "auto" && query.route !== mode) return false;
    return [query.question, ...query.examples].some(
      (example) => normalize(example) === input,
    );
  });
  return matched ? buildPlan(getQuery(matched.id), question, 1) : null;
}

function deterministicPlan(question, mode = "auto") {
  if (!question || !String(question).trim())
    throw new Error("请输入自然语言问题");
  const available = listQueries().filter(
    (query) => mode === "auto" || query.route === mode,
  );
  const ranked = available
    .map((query) => ({ query, score: scoreQuery(String(question), query) }))
    .sort((a, b) => b.score - a.score);
  const selected = ranked[0];
  if (!selected || selected.score < 50) {
    return {
      supported: false,
      question,
      mode,
      message:
        "暂时无法把这个问题映射到认证查询。请选择示例问题，或换一种明确的表达。",
    };
  }

  const definition = getQuery(selected.query.id);
  return buildPlan(definition, question, selected.score / 100);
}

function buildPlan(definition, question, confidence) {
  const parameters =
    definition.id === "Q6"
      ? { ...definition.parameters, ...extractQ6Parameters(String(question)) }
      : { ...(definition.parameters || {}) };
  return {
    supported: true,
    question,
    route: definition.route,
    queryId: definition.id,
    title: definition.title,
    description: definition.description,
    confidence,
    planner: "deterministic",
    parameters,
    cubeQuery: definition.cubeQuery,
    summaryTemplate: definition.summaryTemplate,
  };
}

module.exports = { deterministicPlan, exactCertifiedPlan, extractQ6Parameters };
