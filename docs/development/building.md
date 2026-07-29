# Building

Build every package in dependency order:

```bash
pnpm build
```

Outputs are written to each package's `dist/` directory.

Build one package while iterating:

```bash
pnpm --filter @biopixi/core build
pnpm --filter @biopixi/cli build
```

Generate the static documentation and TypeDoc API:

```bash
pnpm docs:build
```

Serve the Docsify site locally:

```bash
pnpm docs:dev
```
