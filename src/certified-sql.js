const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

const { validateSql } = require("./sql-safety");

const ROOT = path.join(__dirname, "..", "semantic", "certified-sql");
const CATALOG_PATH = path.join(ROOT, "queries.yaml");
const TEMPLATE_ROOT = path.join(ROOT, "templates");
const BACKUP_ROOT = path.join(ROOT, "backups");
const PARAMETER_TYPES = new Set([
  "integer",
  "number",
  "string",
  "date",
  "boolean",
  "enum",
]);

function listCertifiedSqlQueries({ includeDisabled = false } = {}) {
  return readCatalog()
    .queries.filter(
      (query) =>
        includeDisabled ||
        (query.enabled !== false && query.status === "certified"),
    )
    .map(toRuntimeQuery);
}

function getCertifiedSqlQuery(id, options) {
  return listCertifiedSqlQueries(options).find(
    (query) => query.id === normalizeId(id),
  );
}

function listCertifiedSqlAssets() {
  return readCatalog().queries.map((query) => {
    const templatePath = resolveTemplate(query.template);
    return {
      ...query,
      sql: fs.readFileSync(templatePath, "utf8"),
      templatePath: path.relative(path.join(ROOT, ".."), templatePath),
    };
  });
}

function getCertifiedSqlAsset(id) {
  const normalized = normalizeId(id);
  const asset = listCertifiedSqlAssets().find((item) => item.id === normalized);
  if (!asset) throw new Error(`未知认证 SQL：${normalized}`);
  return asset;
}

function validateCertifiedSqlAsset(input) {
  const asset = normalizeAsset(input);
  const defaults = parameterDefaults(asset.parameters);
  const compiledSql = compileTemplate(asset.sql, asset.parameters, defaults);
  const validation = validateSql(compiledSql, { allowExplain: false });
  if (!validation.valid)
    throw new Error(`SQL 安全校验失败：${validation.errors.join("；")}`);
  return {
    valid: true,
    asset,
    compiledSql: validation.sql,
    parameters: defaults,
    placeholders: templatePlaceholders(asset.sql),
  };
}

function publishCertifiedSqlAsset(input) {
  const result = validateCertifiedSqlAsset(input);
  const catalog = readCatalog();
  const index = catalog.queries.findIndex(
    (query) => query.id === result.asset.id,
  );
  const replacing = index >= 0;
  const previous = replacing ? catalog.queries[index] : null;
  const template = `templates/${result.asset.id.toLowerCase()}.sql`;
  const definition = { ...result.asset };
  delete definition.sql;
  definition.template = template;
  if (replacing) catalog.queries[index] = definition;
  else catalog.queries.push(definition);

  fs.mkdirSync(TEMPLATE_ROOT, { recursive: true });
  const templatePath = resolveTemplate(template);
  const backups = [];
  backups.push(backupFile(CATALOG_PATH, "queries"));
  if (previous && fs.existsSync(resolveTemplate(previous.template)))
    backups.push(
      backupFile(
        resolveTemplate(previous.template),
        result.asset.id.toLowerCase(),
      ),
    );
  writeAtomic(templatePath, ensureTrailingNewline(result.asset.sql));
  writeAtomic(CATALOG_PATH, YAML.stringify(catalog, { lineWidth: 120 }));
  return {
    ...result,
    replacing,
    path: path.relative(path.join(ROOT, ".."), templatePath),
    backupPaths: backups
      .filter(Boolean)
      .map((item) => path.relative(path.join(ROOT, ".."), item)),
    restartRequired: false,
  };
}

function deleteCertifiedSqlAsset(id) {
  const normalized = normalizeId(id);
  const catalog = readCatalog();
  const index = catalog.queries.findIndex((query) => query.id === normalized);
  if (index < 0) throw new Error(`未知认证 SQL：${normalized}`);
  const [definition] = catalog.queries.splice(index, 1);
  const templatePath = resolveTemplate(definition.template);
  const backups = [
    backupFile(CATALOG_PATH, "queries"),
    backupFile(templatePath, normalized.toLowerCase()),
  ]
    .filter(Boolean)
    .map((item) => path.relative(path.join(ROOT, ".."), item));
  writeAtomic(CATALOG_PATH, YAML.stringify(catalog, { lineWidth: 120 }));
  if (fs.existsSync(templatePath)) fs.unlinkSync(templatePath);
  return { deleted: normalized, backupPaths: backups, restartRequired: false };
}

function toRuntimeQuery(definition) {
  return {
    ...definition,
    route: "tpch",
    parameters: parameterDefaults(definition.parameters),
    buildSql(values = {}) {
      const template = fs.readFileSync(
        resolveTemplate(definition.template),
        "utf8",
      );
      return compileTemplate(template, definition.parameters, {
        ...parameterDefaults(definition.parameters),
        ...values,
      });
    },
  };
}

function normalizeAsset(input) {
  if (!input || typeof input !== "object")
    throw new Error("认证 SQL 内容不能为空");
  const id = normalizeId(input.id);
  const title = requiredText(input.title, "名称", 160);
  const description = requiredText(input.description, "说明", 1000);
  const question = requiredText(input.question, "标准问题", 500);
  const examples = Array.isArray(input.examples)
    ? [
        ...new Set(
          input.examples.map((item) => String(item).trim()).filter(Boolean),
        ),
      ]
    : [];
  const status = String(input.status || "draft");
  if (
    !new Set(["draft", "validated", "certified", "disabled", "deprecated"]).has(
      status,
    )
  )
    throw new Error(`不支持的状态：${status}`);
  const parameters = normalizeParameters(input.parameters || {});
  const sql = requiredText(input.sql, "SQL", 100000);
  return {
    id,
    title,
    description,
    status,
    enabled: input.enabled !== false,
    question,
    examples,
    parameters,
    governance: {
      owner: String(input.governance?.owner || "demo-team"),
      verified_by: String(input.governance?.verified_by || "demo-team"),
    },
    sql,
  };
}

function normalizeParameters(parameters) {
  if (
    !parameters ||
    typeof parameters !== "object" ||
    Array.isArray(parameters)
  )
    throw new Error("参数定义必须是对象");
  return Object.fromEntries(
    Object.entries(parameters).map(([name, schema]) => {
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name))
        throw new Error(`非法参数名：${name}`);
      if (!schema || typeof schema !== "object")
        throw new Error(`参数 ${name} 缺少定义`);
      const type = String(schema.type || "");
      if (!PARAMETER_TYPES.has(type))
        throw new Error(`参数 ${name} 使用了不支持的类型：${type}`);
      const result = { ...schema, type };
      result.default = validateParameter(name, schema.default, result);
      return [name, result];
    }),
  );
}

function parameterDefaults(parameters) {
  return Object.fromEntries(
    Object.entries(parameters || {}).map(([name, schema]) => [
      name,
      schema.default,
    ]),
  );
}

function compileTemplate(template, parameters, values) {
  const placeholders = templatePlaceholders(template);
  const declared = new Set(Object.keys(parameters || {}));
  for (const name of placeholders)
    if (!declared.has(name)) throw new Error(`SQL 使用了未声明参数：${name}`);
  for (const name of declared)
    if (!placeholders.includes(name))
      throw new Error(`参数未在 SQL 中使用：${name}`);
  const compiled = String(template).replace(
    /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g,
    (_match, name) =>
      parameterLiteral(
        validateParameter(name, values[name], parameters[name]),
        parameters[name],
      ),
  );
  if (/\{\{[^}]*\}\}/.test(compiled)) throw new Error("SQL 包含非法模板表达式");
  return compiled.trim();
}

function templatePlaceholders(template) {
  return [
    ...String(template).matchAll(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g),
  ].map((match) => match[1]);
}

function validateParameter(name, value, schema) {
  if (value === undefined || value === null || value === "")
    throw new Error(`参数 ${name} 缺少默认值`);
  if (schema.type === "integer") {
    const result = Number(value);
    if (!Number.isInteger(result)) throw new Error(`参数 ${name} 必须是整数`);
    enforceRange(name, result, schema);
    return result;
  }
  if (schema.type === "number") {
    const result = Number(value);
    if (!Number.isFinite(result)) throw new Error(`参数 ${name} 必须是数字`);
    enforceRange(name, result, schema);
    return result;
  }
  if (schema.type === "boolean") {
    if (value !== true && value !== false)
      throw new Error(`参数 ${name} 必须是布尔值`);
    return value;
  }
  if (schema.type === "date") {
    const result = String(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result))
      throw new Error(`参数 ${name} 必须使用 YYYY-MM-DD`);
    const parsed = new Date(`${result}T00:00:00Z`);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== result
    )
      throw new Error(`参数 ${name} 不是有效日期`);
    return result;
  }
  const result = String(value);
  if (result.length > Number(schema.maxLength || 1000))
    throw new Error(`参数 ${name} 过长`);
  if (
    schema.type === "enum" &&
    (!Array.isArray(schema.values) ||
      !schema.values.map(String).includes(result))
  )
    throw new Error(`参数 ${name} 不在允许值中`);
  return result;
}

function parameterLiteral(value, schema) {
  if (schema.type === "integer" || schema.type === "number")
    return String(value);
  if (schema.type === "boolean") return value ? "TRUE" : "FALSE";
  return String(value).replace(/'/g, "''");
}

function enforceRange(name, value, schema) {
  if (schema.minimum !== undefined && value < Number(schema.minimum))
    throw new Error(`参数 ${name} 小于最小值`);
  if (schema.maximum !== undefined && value > Number(schema.maximum))
    throw new Error(`参数 ${name} 大于最大值`);
}

function readCatalog() {
  const result = YAML.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  if (!result || !Array.isArray(result.queries))
    throw new Error("认证 SQL Catalog 必须包含 queries 数组");
  return result;
}

function resolveTemplate(relativePath) {
  const normalized = String(relativePath || "");
  if (!/^templates\/[a-z0-9][a-z0-9_-]*\.sql$/.test(normalized))
    throw new Error(`不安全的 SQL Template 路径：${normalized}`);
  const target = path.resolve(ROOT, normalized);
  if (!target.startsWith(`${TEMPLATE_ROOT}${path.sep}`))
    throw new Error("SQL Template 路径越界");
  return target;
}

function normalizeId(value) {
  const result = String(value || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z][A-Z0-9_-]{0,31}$/.test(result))
    throw new Error("Query ID 只能包含大写字母、数字、下划线和连字符");
  return result;
}

function requiredText(value, label, maxLength) {
  const result = String(value || "").trim();
  if (!result) throw new Error(`${label}不能为空`);
  if (result.length > maxLength) throw new Error(`${label}过长`);
  return result;
}

function backupFile(source, name) {
  if (!fs.existsSync(source)) return null;
  fs.mkdirSync(BACKUP_ROOT, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(
    BACKUP_ROOT,
    `${name}.${timestamp}${path.extname(source)}`,
  );
  fs.copyFileSync(source, target);
  return target;
}

function writeAtomic(target, content) {
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, target);
}

function ensureTrailingNewline(value) {
  return `${String(value).trim()}\n`;
}

module.exports = {
  compileTemplate,
  deleteCertifiedSqlAsset,
  getCertifiedSqlAsset,
  getCertifiedSqlQuery,
  listCertifiedSqlAssets,
  listCertifiedSqlQueries,
  publishCertifiedSqlAsset,
  validateCertifiedSqlAsset,
};
