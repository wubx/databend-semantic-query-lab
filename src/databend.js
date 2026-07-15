const { Client } = require('databend-driver');

let connectionPromise;

function getConnection() {
  if (!process.env.DATABEND_DSN) throw new Error('DATABEND_DSN 未配置');
  if (!connectionPromise) {
    const client = new Client(process.env.DATABEND_DSN);
    connectionPromise = client.getConn().catch((error) => {
      connectionPromise = undefined;
      throw error;
    });
  }
  return connectionPromise;
}

async function queryDatabend(sql) {
  const connection = await getConnection();
  try {
    const rows = await connection.queryAll(sql);
    return rows.map((row) => hydrateRow(row.data()));
  } catch (error) {
    connectionPromise = undefined;
    throw error;
  }
}

function hydrateRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (typeof value === 'bigint' || typeof value === 'number') return [key, String(value)];
    if (value instanceof Date) return [key, value.toISOString()];
    return [key, value];
  }));
}

async function explainDatabend(sql) {
  return queryDatabend(`EXPLAIN ${sql}`);
}

module.exports = { explainDatabend, queryDatabend };
