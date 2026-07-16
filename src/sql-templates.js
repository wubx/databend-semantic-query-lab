const { listCertifiedSqlQueries } = require("./certified-sql");

function currentTpchQueries() {
  return Object.fromEntries(
    listCertifiedSqlQueries().map((query) => [query.id, query]),
  );
}

function getQuery(id) {
  return currentTpchQueries()[String(id || "").toUpperCase()];
}

module.exports = {
  currentTpchQueries,
  getQuery,
};
