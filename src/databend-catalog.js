const { queryDatabend } = require("./databend");

async function listDatabases() {
  const rows = await queryDatabend(
    "SELECT catalog, name FROM system.databases ORDER BY catalog, name",
  );
  return rows.map((row) => ({
    catalog: pick(row, "catalog", "catalog_name") || "default",
    name: pick(row, "name", "database", "schema_name"),
  }));
}

async function listTables(database) {
  const rows = await queryDatabend(
    `SELECT table_catalog, table_schema, table_name, table_type
     FROM information_schema.tables
     WHERE table_schema = ?
     ORDER BY table_name`,
    [database],
  );
  return rows.map((row) => ({
    catalog: pick(row, "table_catalog"),
    database: pick(row, "table_schema"),
    name: pick(row, "table_name"),
    type: pick(row, "table_type"),
  }));
}

async function describeTables(database, tableNames) {
  if (!Array.isArray(tableNames) || !tableNames.length) return [];
  const placeholders = tableNames.map(() => "?").join(", ");
  const rows = await queryDatabend(
    `SELECT table_catalog, table_schema, table_name, column_name, ordinal_position,
            data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = ? AND table_name IN (${placeholders})
     ORDER BY table_name, ordinal_position`,
    [database, ...tableNames],
  );
  const tables = new Map();
  for (const row of rows) {
    const name = pick(row, "table_name");
    if (!tables.has(name)) {
      tables.set(name, {
        catalog: pick(row, "table_catalog"),
        database: pick(row, "table_schema"),
        name,
        columns: [],
      });
    }
    tables.get(name).columns.push({
      name: pick(row, "column_name"),
      position: Number(pick(row, "ordinal_position")),
      dataType: pick(row, "data_type"),
      nullable: String(pick(row, "is_nullable")).toUpperCase() === "YES",
      default: pick(row, "column_default"),
    });
  }
  return [...tables.values()];
}

function pick(row, ...names) {
  const entries = Object.entries(row);
  for (const name of names) {
    const found = entries.find(([key]) => key.toLowerCase() === name);
    if (found) return found[1];
  }
  return undefined;
}

module.exports = { describeTables, listDatabases, listTables };
