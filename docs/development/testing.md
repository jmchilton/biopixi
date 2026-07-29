# Testing

The workspace uses [Vitest](https://vitest.dev) and the real Pixi CLI.

```bash
pnpm test
pnpm --filter @biopixi/core test
pnpm --filter @biopixi/cli test
```

`pnpm test` also runs `pnpm test:profile-fixtures`, which needs [Pixi](https://pixi.sh) on `PATH`
or `PIXI_BINARY` pointing at it. The per-package commands above do not.

The core tests preserve the original prototype's executable claims:

- real L0, L1, L3, and L4 Pixi solves;
- checked-in Pixi projects covering every profile-v0 manifest boundary;
- a Pixi-backed integration check proving that every profile fixture, accepted or rejected, is a
  valid Pixi project;
- a focused public custom-channel L2 case;
- the rule that a custom-channel container cannot skip L3; and
- upstream mulled-v2 naming vectors.

Quality checks also include TypeScript, ESLint, Prettier, and Knip:

```bash
pnpm check
```
