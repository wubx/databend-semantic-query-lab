const BLOCKED_KEYWORDS =
  /\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|TRUNCATE|COPY|PUT|GET|SET|USE|KILL|GRANT|REVOKE|CALL)\b/i;
const ALLOWED_SCHEMAS = new Set(["tpch_100", "information_schema"]);

function stripComments(sql) {
  return sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function validateSql(sql, { allowExplain = true } = {}) {
  if (typeof sql !== "string" || !sql.trim())
    return { valid: false, errors: ["SQL 不能为空"] };
  const cleaned = stripComments(sql).trim();
  const errors = [];
  const statements = cleaned
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
  if (statements.length !== 1) errors.push("只允许执行一条 SQL 语句");

  const start = cleaned.match(/^\s*(EXPLAIN\s+)?(SELECT|WITH)\b/i);
  if (!start || (!allowExplain && start[1]))
    errors.push("只允许 SELECT、WITH ... SELECT 或 EXPLAIN 查询");
  if (BLOCKED_KEYWORDS.test(cleaned))
    errors.push("SQL 包含禁止的写入或管理命令");

  for (const match of cleaned.matchAll(
    /\b(?:FROM|JOIN)\s+([`"]?[\w]+[`"]?)\.([`"]?[\w]+[`"]?)/gi,
  )) {
    const schema = match[1].replace(/[`"]+/g, "").toLowerCase();
    if (!ALLOWED_SCHEMAS.has(schema))
      errors.push(`不允许访问 schema: ${schema}`);
  }

  const withoutCtes = stripCteNames(cleaned);
  if (
    /\b(?:FROM|JOIN)\s+(?!\()([`"]?[a-z_][\w]*[`"]?)(?:\s|$)/i.test(withoutCtes)
  ) {
    errors.push("所有数据表必须显式限定为 tpch_100 schema");
  }
  return { valid: errors.length === 0, errors, sql: cleaned };
}

function stripCteNames(sql) {
  const cteNames = [
    ...sql.matchAll(/(?:\bWITH\s+|,\s*)([`"]?[a-z_][\w]*[`"]?)\s+AS\s*\(/gi),
  ].map((match) => match[1].replace(/[`"]+/g, ""));
  return cteNames.reduce(
    (result, name) =>
      result.replace(
        new RegExp(`\\b(FROM|JOIN)\\s+([\\\`\"]?)${name}\\2\\b`, "gi"),
        "$1 (cte)",
      ),
    sql,
  );
}

module.exports = { validateSql };
