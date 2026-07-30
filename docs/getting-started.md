# Getting Started

## Prerequisites

- [Node.js](https://nodejs.org) 22 or newer
- [pnpm](https://pnpm.io) 10.33

## Develop from source

```bash
git clone https://github.com/jmchilton/biopixi.git
cd biopixi
pnpm install
pnpm check
```

Run the built CLI against one of the executable examples:

```bash
pnpm build
node packages/cli/dist/bin/biopixi.js grade examples/l4-single
```

To fail CI when any input grades below a required level:

```bash
node packages/cli/dist/bin/biopixi.js grade my-project --min-level 3
```

## Programmatic use

```typescript
import { grade } from "@biopixi/core";

const result = grade("my-project");
if (result.evidenceState !== "DEFINITIVE") {
  // In profile but unproven (UNRESOLVED, STALE, UNSUPPORTED_LOCK), or out of profile entirely.
  console.error(result.label, result.reasons, result.nextActions);
} else if (result.level < 3) {
  console.error(`capped at L${result.level} by`, result.cap);
}
```

A `level` is only ever a number when `evidenceState` is `DEFINITIVE`. A container named in
`publication` is not a container biopixi has seen: `publication.verified` is false while grading
is offline, and `snapshot` records which vendored metadata revision the claim came from.

The implementation remains a prototype. Consult the
[profile](architecture/profile.md) before treating its output as a stable contract.
