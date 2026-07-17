const { loadManifest } = require("./manifest");

function fuseWorkflowToCte(workflow) {
  const [parent, detail] = workflow.stages || [];
  if (!parent || !detail) return null;
  if (parent.role !== "parent" || detail.role !== "detail") return null;
  if (!parent.query.ungrouped || !detail.query.ungrouped) return null;
  if ((detail.query.filters || []).length !== 1) return null;
  const injected = detail.query.filters[0];
  if (injected.member !== detail.binding.targetMember) return null;
  if (injected.values?.[0] !== "__workflow_key__") return null;

  const parentEntityName = memberEntity(parent.exportMember);
  const targetEntityName = memberEntity(detail.binding.targetMember);
  const manifest = loadManifest();
  const parentEntity = manifest.entities.find(
    (entity) => entity.name === parentEntityName,
  );
  if (!parentEntity || parentEntity.source.sql) return null;
  const relationship = (manifest.relationships || []).find(
    (item) =>
      item.from === targetEntityName &&
      item.to === parentEntityName &&
      item.cardinality === "many_to_one",
  );
  if (!relationship) return null;

  const orderEntries = Object.entries(parent.query.order || {});
  if (!orderEntries.length) return null;
  const parentAlias = `${snake(parentEntityName)}_workflow_parent`;
  const orderSql = orderEntries
    .map(([member, direction]) => {
      if (memberEntity(member) !== parentEntityName) return null;
      const definition = findMember(parentEntity, memberName(member));
      return definition
        ? `"${parentAlias}".${definition.expr} ${direction.toUpperCase()}`
        : null;
    })
    .filter(Boolean);
  if (orderSql.length !== orderEntries.length) return null;

  const source = [
    parentEntity.source.catalog,
    parentEntity.source.schema,
    parentEntity.source.table,
  ]
    .filter(Boolean)
    .join(".");
  const cteName = `workflow_${snake(parent.id)}`;
  const parentSourcePattern = new RegExp(
    `${escapeRegex(source)}\\s+AS\\s+"${escapeRegex(snake(parentEntityName))}"`,
  );
  let detailSql = detail.sql;
  if (!detailSql || !parentSourcePattern.test(detailSql)) return null;
  detailSql = detailSql.replace(
    parentSourcePattern,
    `${cteName} AS "${snake(parentEntityName)}"`,
  );
  detailSql = detailSql.replace(
    new RegExp(
      `LEFT\\s+JOIN\\s+${escapeRegex(cteName)}\\s+AS\\s+"${escapeRegex(snake(parentEntityName))}"`,
      "i",
    ),
    `INNER JOIN ${cteName} AS "${snake(parentEntityName)}"`,
  );
  const placeholderWhere = /\nWHERE\s+\([^\n]*\?(?:[^\n]*)\)/;
  if (!placeholderWhere.test(detailSql)) return null;
  detailSql = detailSql.replace(placeholderWhere, "");

  const sql = `WITH ${cteName} AS (\n  SELECT "${parentAlias}".*\n  FROM ${source} AS "${parentAlias}"\n  ORDER BY ${orderSql.join(", ")}\n  LIMIT ${parent.query.limit}\n)\n${detailSql}`;
  return {
    mode: "fused-cte",
    sql,
    sqlValues: [],
    cte: cteName,
    logicalStages: workflow.stages.length,
    fallbackMode: "staged-cube",
    reason:
      "安全融合父实体 Top N 与子明细展开，在 Databend 内通过 CTE 保留父粒度 Limit。",
  };
}

function findMember(entity, name) {
  return [
    ...(entity.dimensions || []),
    ...(entity.time_dimensions || []),
    ...(entity.facts || []),
  ].find((item) => item.name === name);
}

function memberEntity(member) {
  return String(member || "").split(".")[0];
}

function memberName(member) {
  return String(member || "").split(".")[1];
}

function snake(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { fuseWorkflowToCte };
