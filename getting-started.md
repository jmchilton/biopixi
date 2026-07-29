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
if (result.level === null || result.level < 3) {
  console.error(result.reasons);
}
```

The implementation remains a prototype. Consult the
[profile](architecture/profile.md) before treating its output as a stable contract.
