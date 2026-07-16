# Semantic Manifest maintenance design

## Current issue

`semantic/semantic-manifest.yaml` is the correct single source of truth, but it is
already more than 650 lines. Keeping entities, relationships, verified queries,
AI policy, and runtime extensions in one physical file makes review ownership and
merge conflict management harder than necessary.

Do not introduce multiple independent semantic models. Instead, move to a
**modular authoring model with one deterministic compiled manifest**:

```text
semantic/model.yaml
semantic/entities/*.yaml
semantic/relationships.yaml
semantic/verified-queries.yaml
semantic/policy.yaml
        │
        ├── validation and duplicate detection
        └── deterministic assembly
                    │
                    v
       generated/semantic-manifest.yaml
                    │
                    ├── Embedded Cube compiler
                    ├── semantic catalog UI
                    ├── AI member catalog
                    └── runtime verification
```

The generated manifest remains the runtime contract. Source fragments are
maintainable ownership boundaries, not separate semantic layers.

## Recommended source layout

```text
semantic/
├── model.yaml
├── entities/
│   ├── orders.yaml
│   ├── line-item.yaml
│   ├── customer.yaml
│   ├── supplier.yaml
│   ├── nation.yaml
│   └── region.yaml
├── relationships.yaml
├── verified-queries.yaml
└── policy.yaml
```

Suggested responsibility:

- `entities/*.yaml`: entity steward and data engineer
- `relationships.yaml`: data engineering
- `verified-queries.yaml`: analytics team and business owner
- `policy.yaml`: governance/security
- `model.yaml`: platform owner and global metadata

## Schema improvements

Add governance fields without making them mandatory for existing models:

```yaml
metrics:
  - name: totalPrice
    title: 订单总金额
    description: Sum of total prices across orders.
    business_definition: 指定分析范围内订单金额的合计。
    type: sum
    expr: orderTotal
    unit: currency
    default_time_dimension: orderDate
    owner: sales-analytics
    steward: data-platform
    status: certified
    version: 1.0.0
    synonyms: [订单金额, 销售额, GMV]
```

Recommended lifecycle values:

```text
draft → review → certified → deprecated → retired
```

Only `certified` and explicitly public members should be exposed to the AI
planner by default. Changes to `expr`, aggregation type, filters, primary keys,
privacy, or relationships should be classified as high-risk and require runtime
regression.

## Validation and release flow

```text
Edit a source fragment
→ assemble manifest
→ validate structure and references
→ compile with Cube
→ show generated SQL diff
→ run certified-query tests
→ run selected Databend evidence tests
→ review Git diff / pull request
→ publish
```

The browser should initially be read-only. A future editor should write a draft
or open a pull request instead of mutating the production manifest directly.

## Cube Cloud comparison

Cube Cloud currently provides two related workflows:

1. **Generate data model** can inspect selected database tables and generate Cube
   model files. Existing matching files are backed up, and generated changes can
   be reviewed in the Changes tab.
2. **Visual Modeler** can generate a cube from a selected table and lets users
   edit cubes, members, and joins visually. It also offers an **Edit with YAML**
   mode.
3. **Data Model IDE** uses branch-based development APIs and Git review before
   production. Its AI agent can create or modify models from a natural-language
   request.

Therefore the answer is yes: Cube Cloud can generate a **technical Cube data
model draft** and supports human review/testing before production. It does not
eliminate human semantic work. Database metadata can infer columns, types,
primary-key candidates, and some joins, but cannot reliably determine business
metric definitions, synonyms, ownership, certification, default filters, or
whether a field should be exposed to AI.

Our Portable Semantic Manifest is broader than a Cube model because it also
contains business vocabulary, AI policy, and certified natural-language queries.
A future generator should use the same draft-and-review pattern:

```text
Databend information_schema
→ technical entity/member candidates
→ optional AI enrichment proposals
→ human review
→ semantic source fragments
→ compiled runtime manifest
```
