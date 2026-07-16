# Query regression and runtime validation

The portable manifest is validated at three levels.

## Unit and generated routing regression

```bash
npm test
```

`test/verified-queries.generated.test.js` loads every `verified_queries` entry
and tests its canonical question. It verifies the exact query ID, confidence,
and Cube Query without duplicating those cases in JavaScript. Broader tests are
organized by behavior type (Semantic, Segment, time, join, dynamic query,
Certified SQL, rejection, SQL safety, metadata, and observability), with at
least one representative case per type rather than one test per paraphrase.

## Generated artifact build

```bash
npm run build:semantic
```

This writes the Cube YAML, member catalog, and verified-query catalog to the
ignored `generated/` directory.

## Running Cube metadata validation

After deploying `generated/cube-model.yaml` to Cube, run:

```bash
npm run validate:meta
```

This compares all public manifest measures, dimensions, time dimensions, and
segments against Cube `/meta`. Facts are intentionally excluded because they
are portable intermediate expressions and are not exposed as Cube members.
The command exits non-zero for missing members or kind mismatches.

## Runtime evidence

```bash
npm run verify:runtime
```

This generates SQL, validates it, executes each verified Semantic query through
Cube, and checks any `expected_result` evidence declared in the manifest. Keep
checks deterministic and structural (`columns`, `min_rows`) unless a dataset is
immutable enough to support exact values.

## Observability report

```bash
npm run report:queries
```

To analyze another JSONL file:

```bash
node src/report-queries.js /path/to/query-observability.jsonl
```

The report includes status, route, and query-ID counts; certified and dynamic
rates; LLM usage; Cube versus direct-Databend execution; unsupported questions;
and P50/P95/P99 planning, LLM, query, summary, and end-to-end latency.
