# Databend Semantic SQL Demo

A customer-facing technology demo for the following query flow:

```text
Natural language
  → semantic query or certified TPC-H query
  → validated Databend SQL
  → Databend execution
  → results and explanation
```

## Status

Planning stage. Driver stabilization continues in
[`wubx/cube`](https://github.com/wubx/cube) on the `feat/databend-driver`
branch.

See [PLAN.md](./PLAN.md) for milestones and acceptance criteria.

## Local configuration

Runtime configuration and credentials are loaded from environment variables.
Create a local file from the committed placeholder template:

```bash
cp .env.example .env
```

The `.env` file and all `.env.*` variants except `.env.example` are ignored by
Git. Never commit real Cube, Databend, or AI provider credentials. The AI
integration is optional; the deterministic demo must remain usable with
`AI_ENABLED=false`.
