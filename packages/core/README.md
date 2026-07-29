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

The normative policy is maintained in the repository's
[`PROFILE.md`](https://github.com/jmchilton/biopixi/blob/main/PROFILE.md). The current
implementation is still a prototype; known gaps are listed there.
