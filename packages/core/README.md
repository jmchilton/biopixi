# @biopixi/core

Offline grading primitives for biopixi.

The package parses `pixi.toml` and `pixi.lock`, classifies package-channel readiness, and computes
the deterministic BioContainers image name for an exact target set. It performs no network,
solver, package, or container operations.

## Installation

```bash
pnpm add @biopixi/core
```

## Usage

```typescript
import { grade } from "@biopixi/core";

const result = grade(".");
console.log(result.label, result.reasons);
```

Container adapters can derive the exact, sorted direct Conda roots without parsing Pixi again:

```typescript
import { planCondaBuild } from "@biopixi/core";

const plan = planCondaBuild(".", { minimumLevel: 2 });
console.log(plan.channels, plan.targets);
```

The normative policy is maintained in the repository's
[normative biopixi profile](https://jmchilton.github.io/biopixi/#/profile). The current
implementation is still a prototype; known gaps are listed there.
