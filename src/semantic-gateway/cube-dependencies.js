const path = require("node:path");

function cubeRepositoryRoot() {
  return path.resolve(
    process.env.CUBE_REPOSITORY_PATH ||
      path.join(__dirname, "..", "..", "..", "cube"),
  );
}

function requireCube(relativePath) {
  const modulePath = path.join(cubeRepositoryRoot(), relativePath);
  try {
    return require(modulePath);
  } catch (error) {
    throw new Error(
      `Embedded Cube compiler is unavailable at ${modulePath}. Set CUBE_REPOSITORY_PATH to a built Cube repository. Cause: ${error.message}`,
    );
  }
}

module.exports = { cubeRepositoryRoot, requireCube };
