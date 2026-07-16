# Embedded Cube compiler mode

The demo can run its Semantic path without a Cube Server process. It embeds
Cube's schema compiler and Databend dialect in the 4100 Node.js process, then
executes the generated SQL directly through `databend-driver`.

```text
Browser → Demo 4100 → Embedded Cube compiler → Databend
```

Cube remains the compiler implementation; this mode removes the separate Cube
HTTP server, Query Orchestrator, cache, pre-aggregations, and Cube access-policy
runtime.

## Configuration

```env
SEMANTIC_GATEWAY=embedded
CUBE_REPOSITORY_PATH=/absolute/path/to/a/built/cube
DATABEND_DSN=databend://readonly_user:password@host:8000/tpch_100?sslmode=disable
```

The Cube checkout currently should use
[`wubx/cube`](https://github.com/wubx/cube), branch `feat/databend-driver`, and
must contain built artifacts for:

```text
packages/cubejs-schema-compiler/dist
packages/cubejs-databend-driver/dist
```

If that checkout is already built, point `CUBE_REPOSITORY_PATH` to it and skip
cloning and rebuilding. Otherwise prepare it once:

```bash
git clone --branch feat/databend-driver https://github.com/wubx/cube.git
cd cube
yarn install
yarn build
```

The embedded mode uses Cube internal APIs, so `CUBE_REPOSITORY_PATH` must point
to a compatible Cube revision. It strips Portable Manifest `meta` values before
because those AI-only objects contain arrays that the embedded native YAML
expression compiler does not accept; the full metadata remains available in the
LLM member catalog.

## Fallback mode

To keep the previous topology:

```env
SEMANTIC_GATEWAY=cube-server
CUBE_API_URL=http://localhost:4000/cubejs-api/v1
```

The standalone Cube Server currently should also be built from
[`wubx/cube`](https://github.com/wubx/cube), branch `feat/databend-driver`.
The branch contains the Databend Driver, dialect, and Server Core `databend`
registration that may not yet be present in an upstream or published Cube
release.

The rest of the planner and UI use the same Semantic Gateway interface.

## Behavioral boundary

Embedded mode retains:

- Cube YAML model compilation
- Measures, dimensions, time dimensions, segments, filters, joins, order, and limits
- `DatabendQuery` SQL dialect generation
- SQL values and safe parameter substitution
- Result aliases remapped to Cube member names

Embedded mode does not retain Cube Server features:

- Query Orchestrator and `Continue wait`
- Cube cache and refresh keys
- Pre-aggregations
- Cube Security Context and access-policy enforcement
- Cube `/meta`, `/sql`, `/load`, SQL API, and Playground

Use a read-only Databend account. For production workloads that need Cube's
runtime governance and acceleration, use `cube-server` mode.

## Verification

With Cube Server stopped:

```bash
npm test
npm run verify:runtime
```

The runtime verification compiles and executes S1–S7 through the embedded
compiler and checks result evidence from the Portable Manifest.
