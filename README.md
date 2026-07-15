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
