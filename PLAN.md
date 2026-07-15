# Databend Semantic SQL Demo Plan

## Goal

Build a stable customer demo that turns natural-language questions into either
Cube semantic queries or certified TPC-H SQL, displays the resulting Databend
SQL, validates it, executes it against Databend, and presents the results.

## Architecture

```text
Natural language
       |
       v
Lightweight query router
       |
       +-- Semantic mode --> Cube query --> Databend SQL --+
       |                                                    |
       +-- TPC-H mode ----> Certified SQL template ---------+
                                                            |
                                                            v
                                                     SQL validation
                                                            |
                                                         EXPLAIN
                                                            |
                                                         Databend
                                                            |
                                             results / duration / query ID
```

## Scope

### Included

- Cube semantic queries for common business metrics
- Certified Databend TPC-H SQL templates
- Query routing and parameter extraction
- Read-only SQL validation
- Databend `EXPLAIN` and execution
- A single customer-facing SQL Copilot page
- Generated SQL, results, duration, and query ID
- Rule-based offline fallback
- Optional structured LLM routing after the deterministic flow works

### Excluded from the first demo

- General ontology platform
- Autonomous semantic-model publishing
- Unrestricted Text-to-SQL execution
- Multi-agent workflows
- Long-term memory
- MCP and OAuth
- BYOM administration
- Cube Cloud AI replacement
- Multi-database support
- Production-grade BI dashboarding

## Repository Boundaries

- `wubx/cube`, branch `feat/databend-driver`: Databend Driver only
- `wubx/databend-semantic-sql-demo`: models, TPC-H knowledge, API, web UI,
  evaluation, and deployment scripts

The demo may initially depend on the unpublished driver branch. It should move
to a released driver dependency once one is available.

## Milestone 0 — Driver Gate

This milestone is completed in `wubx/cube`, not this repository.

- [ ] Current Databend Node.js SDK can be installed by Yarn 1
- [ ] Connections are deterministically released
- [ ] Cube refresh keys execute without queue timeout
- [ ] 100 sequential Cube queries pass
- [ ] 10 concurrent Cube queries pass
- [ ] Errors do not block later queries
- [ ] Cube shuts down without leaked processes or connections
- [ ] Real Databend integration test passes

No customer demo is considered stable until this gate passes.

## Milestone 1 — Query Baseline

### Cube semantic model

- [ ] Model `orders`
- [ ] Model `customer`
- [ ] Model `lineitem`
- [ ] Model `nation` and `region`
- [ ] Add tested joins between the models
- [ ] Define titles and descriptions for exposed members

### Certified semantic queries

- [ ] S1 — Total order count
- [ ] S2 — Order amount by order status
- [ ] S3 — Monthly order amount trend

### Certified TPC-H queries

- [ ] Q1 — Pricing summary report
- [ ] Q6 — Forecasting revenue change
- [ ] Q21 — Suppliers who kept orders waiting

### Verification

- [ ] Store expected query results or deterministic result checks
- [ ] Record baseline execution duration
- [ ] Add `scripts/verify-demo.sh`
- [ ] All six queries pass without an LLM

## Milestone 2 — Rule-Based Demo

### API

- [ ] `GET /api/health`
- [ ] `GET /api/query/examples`
- [ ] `POST /api/query/plan`
- [ ] `POST /api/query/validate`
- [ ] `POST /api/query/execute`

### Query router

- [ ] Route common metric questions to certified semantic queries
- [ ] Route Q1, Q6, and Q21 questions to certified SQL templates
- [ ] Extract supported template parameters deterministically
- [ ] Reject unsupported questions with a clear message

### SQL safety

- [ ] Allow only a single `SELECT`, `WITH ... SELECT`, or `EXPLAIN` statement
- [ ] Restrict access to `tpch_100`
- [ ] Reject DDL, DML, `COPY`, `SET`, `USE`, `KILL`, and multi-statement SQL
- [ ] Use a read-only Databend account
- [ ] Enforce query timeout
- [ ] Limit result rows
- [ ] Run `EXPLAIN` before execution

### Web UI

- [ ] Natural-language input
- [ ] Example question selector
- [ ] Auto, Semantic, and TPC-H modes
- [ ] Query interpretation panel
- [ ] Cube Query panel when applicable
- [ ] Generated Databend SQL panel
- [ ] Validate, Explain, and Run actions
- [ ] Result table
- [ ] Duration and Databend query ID

### Acceptance

- [ ] All six certified questions work offline without an external LLM
- [ ] One-command startup
- [ ] Health checks verify every service
- [ ] Generated SQL is visible before execution

## Milestone 3 — Lightweight LLM Integration

The LLM performs only routing, parameter extraction, and result explanation.
It does not execute SQL or change semantic models.

- [ ] Add an OpenAI-compatible provider interface
- [ ] Load provider URL, API key, model, and timeout only from environment variables
- [ ] Keep `.env` and provider credentials out of Git; commit placeholders only in `.env.example`
- [ ] Enforce structured JSON Schema output
- [ ] Select Semantic or TPC-H route
- [ ] Select a certified query ID
- [ ] Extract supported parameters
- [ ] Generate a summary only from real query results
- [ ] Add timeout and retry limits
- [ ] Fall back to deterministic routing when unavailable
- [ ] Never send Databend credentials to the model
- [ ] Add a secret scan to CI before enabling external contributions

### Evaluation

Prepare at least three paraphrases for each certified question.

- [ ] Routing accuracy ≥ 95%
- [ ] Template selection accuracy ≥ 95%
- [ ] Parameter extraction accuracy ≥ 95%
- [ ] Executed-query success rate = 100%
- [ ] Unsupported requests are rejected rather than guessed

## Milestone 4 — Expand the Demo

After the initial customer demo is stable:

- [ ] Add Semantic S4 — Top customers by order amount
- [ ] Add Semantic S5 — Order amount by region
- [ ] Add TPC-H Q5 — Local supplier volume
- [ ] Add TPC-H Q17 — Small-quantity-order revenue
- [ ] Add simple result charts
- [ ] Add downloadable query evidence

## Optional Milestone 5 — Controlled Free Text-to-SQL

This milestone is not required for the first customer demo.

- [ ] Retrieve relevant schema and relationship context
- [ ] Retrieve similar certified TPC-H examples
- [ ] Generate SQL as a review-required draft
- [ ] Parse SQL into an AST before execution
- [ ] Validate identifiers and schemas
- [ ] Run Databend `EXPLAIN`
- [ ] Require explicit user confirmation
- [ ] Label generated SQL separately from certified SQL

## Demo Questions

| ID | Question | Route | Initial status |
| --- | --- | --- | --- |
| S1 | 订单总数是多少？ | Semantic | Pending |
| S2 | 按订单状态统计订单金额。 | Semantic | Pending |
| S3 | 每月订单金额趋势是什么？ | Semantic | Pending |
| Q1 | 执行 TPC-H Q1 定价汇总报表。 | TPC-H template | Pending |
| Q6 | 执行 Q6，折扣在 5% 到 7% 之间，数量小于 24。 | TPC-H template | Pending |
| Q21 | 查询没有收到延迟订单的供应商。 | TPC-H template | Pending |

## Customer Demo Script

1. Ask “按订单状态统计订单金额。”
2. Show the selected Cube measure and dimension.
3. Show the Databend SQL generated by Cube.
4. Validate and execute the query.
5. Ask for TPC-H Q6 with modified parameters.
6. Show certified-template selection and extracted parameters.
7. Validate and execute the SQL.
8. Ask the Q21 supplier question to demonstrate `EXISTS` and `NOT EXISTS`.
9. Show duration, query ID, and real result rows.

## Definition of Done for the First Demo

- [ ] Driver stability gate passes
- [ ] Three semantic and three TPC-H questions pass
- [ ] The complete demo works without an external LLM
- [ ] LLM integration has a deterministic fallback
- [ ] SQL is visible and validated before execution
- [ ] Only read-only access to `tpch_100` is possible
- [ ] Query timeout and row limit are enforced
- [ ] Query failures never produce fabricated answers
- [ ] Setup and demo steps are documented
