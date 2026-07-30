---
"@biopixi/core": minor
"@biopixi/cli": minor
---

Stabilize the grade command's contract.

`Grade` now records the invocation's `projectRoot` and `sourceRoot` on every result. `GradeOptions.sourceRoot` widens the bound on path dependencies to an ancestor of the project, as PROFILE.md allows for collections, and raises the new `SourceRootError` when it cannot contain the project. `Cap`, `EvidenceState`, `MetadataSnapshot`, and `Publication` are exported.

The CLI gains `--source-root` and `--json`. The JSON payload is an envelope carrying the schema URL, the biopixi version, and the profile the levels belong to; its schema is generated from the types that produce it and published alongside a generated reference page.

`--min-level` no longer answers every failure with exit code 1: `1` is a graded result below the threshold, `2` is a project with no solve to grade, `3` is a project outside the profile, and `64` is a bad invocation. Callers relying on "nonzero means failure" are unaffected; callers testing for `1` specifically will see `2` or `3` where they previously saw `1`.
