const fs = require("node:fs");
const path = require("node:path");

const {
  assembleManifest,
  DEFAULT_MODEL_PATH,
  stringifyManifest,
} = require("./semantic-assembler");

const ROOT = path.dirname(DEFAULT_MODEL_PATH);

function listSemanticSourceFiles() {
  const model = readModel();
  const entityFiles = Array.isArray(model.includes?.entities)
    ? model.includes.entities
    : [];
  const files = [
    "model.yaml",
    ...entityFiles,
    model.includes?.relationships,
    model.includes?.verified_queries,
    model.includes?.policy,
  ].filter(Boolean);
  return [
    {
      id: "compiled",
      name: "完整运行时 Manifest",
      path: "generated/semantic-manifest.yaml",
      group: "运行时编译结果",
      generated: true,
    },
    ...files.map((relativePath) => ({
      id: relativePath,
      name: path.basename(relativePath),
      path: `semantic/${relativePath}`,
      group: relativePath.startsWith("entities/") ? "实体" : "模型配置",
      generated: false,
    })),
  ];
}

function readSemanticSourceFile(id) {
  if (id === "compiled") {
    return {
      id,
      path: "generated/semantic-manifest.yaml",
      generated: true,
      content: stringifyManifest(assembleManifest()),
    };
  }
  const files = new Set(
    listSemanticSourceFiles()
      .filter((file) => !file.generated)
      .map((file) => file.id),
  );
  if (!files.has(id)) throw new Error("Unknown semantic source file");
  return {
    id,
    path: `semantic/${id}`,
    generated: false,
    content: fs.readFileSync(path.join(ROOT, id), "utf8"),
  };
}

function readModel() {
  const YAML = require("yaml");
  return YAML.parse(fs.readFileSync(DEFAULT_MODEL_PATH, "utf8"));
}

module.exports = { listSemanticSourceFiles, readSemanticSourceFile };
