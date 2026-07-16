const {
  getQuery: getSqlTemplateQuery,
  currentTpchQueries,
} = require("./sql-templates");
const { compileVerifiedQueries } = require("./compiler");
const { loadManifest } = require("./manifest");

function currentSemanticQueries() {
  return Object.fromEntries(
    compileVerifiedQueries(loadManifest()).map((query) => [query.id, query]),
  );
}

function listQueries() {
  return [
    ...Object.values(currentSemanticQueries()),
    ...Object.values(currentTpchQueries()),
  ].map((query) => ({
    id: query.id,
    title: query.title,
    route: query.route,
    description: query.description,
    question: query.question,
    examples: query.examples,
    parameters: query.parameters || {},
  }));
}

function getQuery(id) {
  return currentSemanticQueries()[id] || getSqlTemplateQuery(id);
}

module.exports = {
  currentSemanticQueries,
  getQuery,
  listQueries,
};
