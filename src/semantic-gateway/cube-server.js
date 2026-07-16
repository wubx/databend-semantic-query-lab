const { cubeHealth, executeCube, getCubeSql } = require("../cube");

class CubeServerGateway {
  constructor() {
    this.name = "cube-server";
  }

  async health() {
    return { ...(await cubeHealth()), gateway: this.name };
  }

  async compile(cubeQuery) {
    return { ...(await getCubeSql(cubeQuery)), gateway: this.name };
  }

  async execute(cubeQuery) {
    const result = await executeCube(cubeQuery);
    return {
      ...result,
      gateway: this.name,
      source: "Cube semantic query",
    };
  }
}

module.exports = { CubeServerGateway };
