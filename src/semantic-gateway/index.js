require("dotenv").config();

const { CubeServerGateway } = require("./cube-server");
const { EmbeddedCompilerGateway } = require("./embedded");

let gateway;

function semanticGatewayMode() {
  return String(process.env.SEMANTIC_GATEWAY || "embedded").toLowerCase();
}

function getSemanticGateway() {
  if (gateway) return gateway;
  const mode = semanticGatewayMode();
  if (mode === "embedded") gateway = new EmbeddedCompilerGateway();
  else if (mode === "cube" || mode === "cube-server")
    gateway = new CubeServerGateway();
  else throw new Error(`Unsupported SEMANTIC_GATEWAY: ${mode}`);
  return gateway;
}

function resetSemanticGateway() {
  gateway = null;
}

module.exports = {
  getSemanticGateway,
  resetSemanticGateway,
  semanticGatewayMode,
};
