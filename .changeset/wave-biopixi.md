---
"@biopixi/core": minor
"@biopixi/wave-cli": minor
---

Add the builder-independent `planCondaBuild` projection with deterministic direct roots, exact
locked versions and build strings, manifest channel order, target-table overrides, and explicit
channel reconciliation. Explicit channel qualifiers are now also preserved in grader target and
mulled identity calculations. Lock reconciliation covers manifest channel changes, common Conda
version ranges, build-string globs, and exact explicit-channel URL identity. Credential-bearing
channel URLs are held below the hosted-build boundary and redacted from diagnostics.

Publish `wave-biopixi`, a small adapter that requires definitive L2-or-higher evidence and invokes
Wave with derived Conda packages, channels, and `linux/amd64`. It supports command-only rendering
and selected Wave lifecycle options, inherits Wave's output, environment, and exit status, and
hands local L1 projects off to `mulled-biopixi`. Malformed project evidence has a distinct exit
category, and signal-terminated Wave children produce conventional signal-derived exit codes.
