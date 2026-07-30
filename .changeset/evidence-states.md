---
"@biopixi/core": minor
"@biopixi/cli": minor
---

Separate evidence from readiness. `Grade` now reports `conformant` and an `evidenceState` of
`DEFINITIVE`, `UNRESOLVED`, `STALE`, or `UNSUPPORTED_LOCK`, and `level` is a number only when the
evidence is definitive — a missing or stale lock no longer earns L1. Results also carry the `cap`
that holds a level down, `nextActions`, a `publication` whose `verified` flag is honest about
never having reached a registry, and the `snapshot` provenance (revision and fetch date) behind
any BioContainers claim. The former free-text `evidence` field is replaced by `publication`.
