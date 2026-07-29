# Contributing

biopixi is a pnpm workspace. Keep package responsibilities narrow:

- policy-free parsing and grading primitives belong in `packages/core`;
- command parsing and terminal presentation belong in `packages/cli`;
- the normative policy belongs in `PROFILE.md`.

Before submitting a change:

```bash
pnpm check
```

For a user-visible package change, add a release note with `pnpm changeset`.

Do not edit `packages/core/data/biocontainers-hash.tsv` casually. It is a vendored public-metadata
snapshot whose provenance is documented beside it.
