# Testing

The workspace uses [Vitest](https://vitest.dev).

```bash
pnpm test
pnpm --filter @biopixi/core test
pnpm --filter @biopixi/cli test
```

The core tests preserve the original prototype's executable claims:

- real L0, L1, L3, and L4 Pixi solves;
- a focused public custom-channel L2 case;
- the rule that a custom-channel container cannot skip L3; and
- upstream mulled-v2 naming vectors.

Quality checks also include TypeScript, ESLint, Prettier, and Knip:

```bash
pnpm check
```
