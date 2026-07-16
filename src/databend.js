const { Client } = require("databend-driver");
const sqlstring = require("sqlstring");

let connectionPromise;

function getConnection() {
  if (!process.env.DATABEND_DSN) throw new Error("DATABEND_DSN 未配置");
  if (!connectionPromise) {
    const client = new Client(process.env.DATABEND_DSN);
    connectionPromise = client.getConn().catch((error) => {
      connectionPromise = undefined;
      throw error;
    });
  }
  return connectionPromise;
}

async function queryDatabend(sql, values = []) {
  const connection = await getConnection();
  try {
    const rows = await connection.queryAll(sqlstring.format(sql, values));
    return rows.map((row) => hydrateRow(row.data()));
  } catch (error) {
    connectionPromise = undefined;
    throw error;
  }
}

function hydrateRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (typeof value === "bigint" || typeof value === "number")
        return [key, String(value)];
      if (value instanceof Date) return [key, value.toISOString()];
      return [key, value];
    }),
  );
}

async function explainDatabend(sql, values = []) {
  return queryDatabend(`EXPLAIN ${sql}`, values);
}

module.exports = { explainDatabend, queryDatabend };
