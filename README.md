# Databend Semantic SQL Demo

一个基于 **Cube Semantic Layer + Databend + 可选 LLM** 的语义查询与语义模型管理 Demo。

它将业务问题转换为受治理的 Cube Query 或认证 TPC-H SQL，在执行前完成成员、参数和 SQL 安全校验，然后查询 Databend 并展示真实结果。同时提供可视化语义层、模块化 YAML 维护以及从 Databend 表生成模型草稿的能力。

```text
业务问题
   │
   ├─ 精确匹配认证查询
   ├─ LLM 生成受约束的 Cube Query（可选）
   └─ 确定性规则路由兜底
   │
   ├─ Semantic 路径：Cube 编译器 → Databend SQL
   └─ TPC-H 路径：认证 SQL Template
   │
   └─ SQL 安全校验 → EXPLAIN / 执行 → Databend → 结果与可观测日志
```

## 主要功能

### Semantic SQL Copilot

- 使用自然语言查询订单、销售额、发货、供应商和区域等 TPC-H 业务数据
- 优先匹配认证查询，也可以动态组合受校验的 Cube Query
- 展示查询理解、Cube Query、生成的 Databend SQL、参数和执行结果
- 支持 SQL 校验、`EXPLAIN` 和真实查询执行
- LLM 不可用时自动回退到确定性路由
- 默认记录规划和执行阶段的 JSONL 可观测日志

### 可视化语义层

- 浏览实体、度量、维度、时间维度、分组和实体关系
- 查看业务名称、描述、同义词、枚举、隐私属性和认证查询引用
- 搜索和筛选已发布的语义成员
- 查看实时组装的完整 Runtime Manifest

### Semantic Model 管理

语义模型采用模块化 YAML 维护：

```text
semantic/model.yaml                 # 模型入口和 includes
semantic/entities/*.yaml            # 实体、度量、维度和分组
semantic/relationships.yaml         # 实体关系
semantic/verified-queries.yaml      # 认证查询
semantic/policy.yaml                # AI 与查询治理声明
```

页面支持：

- 在线查看、编辑、校验和发布模块化 YAML
- 发布前组装完整 Manifest 并执行引用校验和 Cube 编译
- 发布时自动备份旧文件并热重载 Embedded Compiler，无需重启服务
- 安全删除实体；存在 Relationship 或认证查询引用时拒绝删除
- 从 Databend Catalog 选择数据库和表，自动生成可审阅的实体草稿
- 可选使用 LLM 补充业务名称、描述、定义和同义词
- LLM 只能增强业务元数据，不能修改表来源、SQL 表达式、类型、聚合方式、主键和访问权限

### 已包含的认证查询

- `S1`：订单总数
- `S2`：按订单状态统计订单金额
- `S3`：每月订单金额趋势
- `S4`：按年统计发货商品数量
- `S5`：延迟收货明细数量
- `S6`：运输方式与效率分析
- `S7`：按区域统计订单金额
- `Q1`：TPC-H Pricing Summary Report
- `Q6`：TPC-H Forecasting Revenue Change
- `Q21`：TPC-H Suppliers Who Kept Orders Waiting

## 运行架构

项目支持两种 Semantic Gateway。

### Embedded 模式（推荐用于本地 Demo）

```text
Browser → Demo Server :4100 → Embedded Cube Compiler → Databend
```

Cube Schema Compiler 和 `DatabendQuery` SQL Dialect 直接运行在 Demo 的 Node.js 进程中，不需要另外启动 Cube Server。

保留的能力：

- Cube YAML 编译
- Measures、Dimensions、Segments、Filters、Joins、Order 和 Limit
- Databend SQL 生成及参数绑定
- Cube 成员别名映射

不包含 Cube Server 的以下运行时能力：

- Query Orchestrator 和缓存
- Pre-aggregations
- Cube Security Context 和 Access Policy Enforcement
- Cube `/meta`、`/sql`、`/load`、SQL API 和 Playground

生产环境如需缓存、预聚合和运行时访问策略，建议使用 `cube-server` 模式。

### Cube Server 模式

```text
Browser → Demo Server :4100 → Cube Server :4000 → Databend
```

通过 Cube HTTP API 完成语义查询，适合需要完整 Cube Runtime 能力的环境。

## 环境要求

- Node.js 20 或更高版本
- npm
- 可访问的 Databend
- 已加载 TPC-H SF100 数据的 `tpch_100` 数据库
- 一个只读 Databend 用户
- Embedded 模式还需要一份兼容且已构建的 Cube 源码
- LLM 是可选项；未配置 LLM 时认证查询和确定性路由仍可运行

## 快速开始：Embedded 模式

### 1. 获取并构建 Cube

如果本地还没有 Cube：

```bash
git clone https://github.com/cube-js/cube.git
cd cube
yarn install
yarn build
```

构建后至少应存在：

```text
packages/cubejs-schema-compiler/dist
packages/cubejs-databend-driver/dist
```

`CUBE_REPOSITORY_PATH` 必须指向这份 Cube 仓库的绝对路径。

> Embedded 模式调用 Cube 内部编译器 API，因此 Demo 与 Cube 源码版本需要兼容。当前开发环境使用的是包含 Databend Driver 的 Cube 仓库。

### 2. 安装 Demo 依赖

```bash
git clone https://github.com/wubx/databend-semantic-sql-demo.git
cd databend-semantic-sql-demo
npm install
```

### 3. 创建配置

```bash
cp .env.example .env
```

编辑 `.env`，最小配置如下：

```env
SEMANTIC_GATEWAY=embedded
CUBE_REPOSITORY_PATH=/absolute/path/to/cube
DATABEND_DSN=databend://readonly_user:password@databend-host:8000/tpch_100?sslmode=disable

PORT=4100
AI_ENABLED=false
MODELER_PUBLISH_ENABLED=false
```

注意：

- 使用只读 Databend 账户
- 如果用户名或密码中含有 `@`、`:`、`/`、`#` 等字符，需要进行 URL 编码
- Databend Cloud 请根据实际连接信息配置主机、端口和 TLS 参数
- `.env` 已被 Git 忽略，不要把真实密码或 API Key 写入 `.env.example`

### 4. 启动服务

```bash
npm start
```

开发时可以使用自动重启模式：

```bash
npm run dev
```

打开：

```text
http://localhost:4100
```

### 5. 检查运行状态

```bash
curl http://localhost:4100/api/health
```

正常响应应满足：

```json
{
  "ok": true,
  "checks": {
    "api": { "ok": true },
    "cube": { "ok": true },
    "databend": { "ok": true }
  },
  "semanticGateway": "embedded"
}
```

如果 `cube.ok` 为 `false`，优先检查 `CUBE_REPOSITORY_PATH` 和 Cube 的 `dist` 构建产物；如果 `databend.ok` 为 `false`，检查 DSN、网络、TLS、用户权限和 `tpch_100` 数据库。

## 使用 Cube Server 模式

先启动一个能够连接 Databend 且已加载对应 Cube Model 的 Cube Server，然后修改 `.env`：

```env
SEMANTIC_GATEWAY=cube-server
CUBE_API_URL=http://localhost:4000/cubejs-api/v1
CUBE_API_SECRET=replace-with-a-local-secret

DATABEND_DSN=databend://readonly_user:password@databend-host:8000/tpch_100?sslmode=disable
```

再启动 Demo：

```bash
npm start
```

Cube Server 模式不使用 `CUBE_REPOSITORY_PATH`。详细边界见 [`docs/embedded-cube-compiler.md`](./docs/embedded-cube-compiler.md)。

## 启用 LLM

项目支持 OpenAI-compatible Chat Completions API。LLM 仅用于：

- 在认证查询之后进行受约束的动态 Cube Query 规划
- 根据真实查询结果生成简短摘要
- 为生成的 Semantic Model 草稿补充业务元数据

配置：

```env
AI_ENABLED=true
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=replace-with-your-api-key
AI_MODEL=gpt-4.1-mini
AI_REQUEST_TIMEOUT_MS=30000

MODELER_AI_TIMEOUT_MS=90000
MODELER_AI_MAX_TOKENS=1800
```

如果访问外部模型需要代理：

```env
HTTPS_PROXY=http://127.0.0.1:7890
HTTP_PROXY=http://127.0.0.1:7890
NO_PROXY=127.0.0.1,localhost,databend-host
```

LLM 返回结果仍需经过本地成员、成员类型、Filter Operator、枚举值、时间粒度和 Limit 校验。LLM 不直接生成或执行 SQL。

## 启用模型发布

默认只允许生成和校验草稿，不允许写入语义源文件：

```env
MODELER_PUBLISH_ENABLED=false
```

需要在本地维护模型时，显式开启：

```env
MODELER_PUBLISH_ENABLED=true
```

开启后，可以在“语义层”页面中：

1. 从 Databend 表生成模型草稿；
2. 人工检查并直接修改 YAML；
3. 校验完整 Manifest 和 Cube 编译结果；
4. 发布到 `semantic/entities/`；
5. 编辑现有模块化 YAML；
6. 删除无引用的实体。

发布或删除前，旧文件会保存到：

```text
semantic/backups/
```

模块化 YAML 发布成功后会热重载 Embedded Compiler，通常不需要重启服务。以下情况仍需重启：

- 修改 `.env` 或其他进程级环境变量；
- 修改服务端 JavaScript 代码且未使用 `npm run dev`；
- 切换 `SEMANTIC_GATEWAY`；
- 更换或重新构建 `CUBE_REPOSITORY_PATH` 指向的 Cube 编译器代码。

## 构建和校验语义模型

将模块化语义源确定性组装为运行时产物：

```bash
npm run build:semantic
```

产物写入未纳入 Git 的 `generated/`：

```text
generated/semantic-manifest.yaml
# 以及 Cube Model、LLM Member Catalog 和认证查询 Catalog
```

运行单元测试：

```bash
npm test
```

连接真实 Databend，编译并执行 `S1`–`S7`：

```bash
npm run verify:runtime
```

验证运行时 Cube Metadata：

```bash
npm run validate:meta
```

输出认证查询报告：

```bash
npm run report:queries
```

## 页面使用

启动后访问 `http://localhost:4100`。

### 查询页面

1. 输入业务问题或选择示例；
2. 选择 `Auto`、`Semantic` 或 `TPC-H` 模式；
3. 生成查询计划；
4. 查看 Cube Query 和 Databend SQL；
5. 执行校验、`EXPLAIN` 或真实查询；
6. 查看结果、耗时和请求信息。

### 语义层页面

- **语义模型**：按实体和成员浏览业务语义层
- **关系图**：查看实体间 Join 关系
- **认证查询**：查看已验证的问题和 Cube Query
- **原始 YAML**：查看、编辑、校验和发布模块化语义源
- **生成模型**：选择 Databend 数据库和表，生成规则草稿或 LLM 增强草稿

## 常用配置

| 环境变量                     | 默认值                             | 说明                                      |
| ---------------------------- | ---------------------------------- | ----------------------------------------- |
| `PORT`                       | `4100`                             | Demo HTTP 端口                            |
| `SEMANTIC_GATEWAY`           | `embedded`                         | `embedded` 或 `cube-server`               |
| `CUBE_REPOSITORY_PATH`       | 无                                 | Embedded 模式下已构建 Cube 仓库的绝对路径 |
| `CUBE_API_URL`               | 无                                 | Cube Server API 地址                      |
| `CUBE_API_SECRET`            | 无                                 | Cube Server API Secret                    |
| `DATABEND_DSN`               | 无                                 | Databend 连接字符串，建议使用只读用户     |
| `RESULT_ROW_LIMIT`           | `500`                              | 单次返回的最大行数                        |
| `AI_ENABLED`                 | `false`                            | 是否启用 LLM 规划、摘要和模型增强         |
| `AI_BASE_URL`                | OpenAI API                         | OpenAI-compatible API 地址                |
| `AI_MODEL`                   | `gpt-4.1-mini`                     | 模型名称                                  |
| `MODELER_PUBLISH_ENABLED`    | `false`                            | 是否允许写入、替换和删除语义源文件        |
| `MODEL_GENERATOR_MAX_TABLES` | `20`                               | 单次最多生成的表数量                      |
| `QUERY_LOG_ENABLED`          | `true`                             | 是否记录查询可观测日志                    |
| `QUERY_LOG_PATH`             | `logs/query-observability.jsonl`   | 查询日志文件                              |
| `MODELER_LOG_PATH`           | `logs/modeler-observability.jsonl` | 模型生成日志文件                          |

完整示例见 [`.env.example`](./.env.example)。

## 项目结构

```text
.
├── public/                         # 无框架 Web UI
├── semantic/
│   ├── model.yaml                 # 模型入口
│   ├── entities/                  # 模块化实体模型
│   ├── relationships.yaml         # 关系定义
│   ├── verified-queries.yaml      # 认证查询
│   ├── policy.yaml                # AI / 查询 Policy 声明
│   └── backups/                   # 发布和删除前的自动备份
├── src/
│   ├── server.js                  # Express API 和静态站点
│   ├── planner.js                 # 查询规划与路由
│   ├── semantic-gateway/          # Embedded / Cube Server Gateway
│   ├── semantic-assembler.js      # 模块化 Manifest 组装
│   ├── semantic-source-editor.js  # YAML 校验、发布和删除
│   ├── model-generator.js         # Databend Catalog → 实体草稿
│   ├── model-enricher.js          # 受约束的 LLM 元数据增强
│   ├── compiler.js                # Cube Model 与 Catalog 编译
│   └── sql-safety.js              # 只读 SQL 安全校验
├── test/                           # Node.js 单元和回归测试
├── docs/                           # 设计和运行文档
└── generated/                      # 构建产物，不提交 Git
```

## 安全边界

这是一个 Demo，但仍建议遵守以下规则：

- 始终使用只读 Databend 账户；
- 不要在 Git 中提交 `.env`、DSN、Token 或 API Key；
- SQL Safety 只允许单条只读查询，并限制访问 `tpch_100`；
- LLM 不直接生成 SQL，只能选择认证查询或构造受校验的 Cube Query；
- 所有模型发布必须显式设置 `MODELER_PUBLISH_ENABLED=true`；
- 模型发布前会执行完整 Manifest 校验和 Cube 编译；
- Embedded 模式不包含 Cube Server 的 Security Context 和访问策略；生产治理场景应使用 Cube Server。

> `semantic/policy.yaml` 当前会进入 Manifest 和 LLM 上下文，但其中部分字段仍属于声明性治理元数据，不等同于完整的运行时 Policy Engine。最终安全边界以服务端成员校验、SQL Safety、只读数据库账号和 Cube Runtime 配置为准。

## 可观测性

默认日志：

```text
logs/query-observability.jsonl
logs/modeler-observability.jsonl
```

查询日志记录问题、路由结果、Cube Query、最终 SQL、阶段耗时和执行结果；模型日志记录 Catalog 读取、规则生成、LLM 增强、回退原因和总耗时。

详细格式见：

- [`docs/query-observability-log.md`](./docs/query-observability-log.md)
- [`docs/validation-and-regression.md`](./docs/validation-and-regression.md)

## 进一步阅读

- [Embedded Cube Compiler 模式](./docs/embedded-cube-compiler.md)
- [Semantic Manifest 维护设计](./docs/semantic-manifest-maintenance.md)
- [验证和回归测试](./docs/validation-and-regression.md)
- [查询可观测日志](./docs/query-observability-log.md)
- [Snowflake Semantic View 字段参考](./docs/snowflake-semantic-view-reference.md)
- [Snowflake 与 Cube 语义层设计对比](./docs/snowflake-vs-cube-combined-semantic-layer.md)
- [项目计划与验收条件](./PLAN.md)

## License

Apache-2.0
