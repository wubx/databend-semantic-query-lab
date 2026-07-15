function cubeUrl(path) {
  const base = (process.env.CUBE_API_URL || 'http://127.0.0.1:4000/cubejs-api/v1').replace(/\/$/, '');
  return `${base}/${path}`;
}

async function cubeRequest(path, query) {
  const url = new URL(cubeUrl(path));
  if (query) url.searchParams.set('query', JSON.stringify(query));
  const headers = {};
  if (process.env.CUBE_API_TOKEN) headers.Authorization = process.env.CUBE_API_TOKEN;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(60000) });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(body.error || `Cube API 返回 HTTP ${response.status}`);
  return body;
}

async function getCubeSql(query) {
  const body = await cubeRequest('sql', query);
  const sql = body.sql?.sql;
  if (!Array.isArray(sql) || typeof sql[0] !== 'string') throw new Error('Cube 没有返回可执行 SQL');
  return { sql: sql[0], values: sql[1] || [], metadata: body.sql };
}

async function executeCube(query) {
  return cubeRequest('load', query);
}

async function cubeHealth() {
  const body = await cubeRequest('meta');
  return { ok: true, cubes: body.cubes?.map((cube) => cube.name) || [] };
}

module.exports = { cubeHealth, executeCube, getCubeSql };
