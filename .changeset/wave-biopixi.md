---
"@biopixi/core": minor
"@biopixi/cli": minor
"@biopixi/wave-cli": minor
---

Add the builder-independent `planCondaBuild` projection with deterministic direct roots, exact
locked versions and build strings, manifest channel order, and target-table overrides. `grade` and
`planCondaBuild` now derive those roots through one shared `resolveDirectRoots`, so a build can
never be assembled from a different reading of the manifest than the one that was graded.

Reconcile the lock against the manifest before assigning a level: channel configuration, direct
version ranges, build-string globs, and explicit channel URL identity. Each check abstains rather
than guesses — an epoch, a local version identifier, or a clause shape biopixi does not implement
produces no finding, because a project wrongly told its correct lock is stale has nowhere to go.

Preserve explicit channel qualifiers where they are part of container identity — the grader's
target string and multi-package mulled hashing — and keep them out of it where they are not. A
single-package image is named from the package alone, a registered combination is named from the
spelling `combinations/hash.tsv` records, and `hash.tsv` matching ignores qualifiers on both
sides. Adding `channel = "bioconda"` to a dependency no longer changes which container a project
is found to have.

Hold credential-bearing channel URLs below the hosted-build boundary, and redact userinfo and URL
parameters from every rendering, `biopixi grade`'s included, through one shared
`redactSensitiveUrls`.

Share one exit-code vocabulary and one output shim across every biopixi executable, exported from
`@biopixi/core` as `EXIT_CODES` and `CommandIo`. `@biopixi/cli` re-exports `EXIT_CODES`
unchanged; `GradeCommandIo` is now a deprecated alias of `CommandIo`.

Publish `wave-biopixi`, a small adapter that requires definitive L2-or-higher evidence and invokes
Wave with derived Conda packages, channels, and `linux/amd64`. It supports command-only rendering
and selected Wave lifecycle options, and inherits Wave's output, environment, and exit status.
Unusable project evidence exits `EX_DATAERR`, a missing Wave executable `EX_UNAVAILABLE`, and
signal-terminated Wave children produce conventional signal-derived exit codes.

`grade` and `planCondaBuild` both accept a project directory or the `pixi.toml` inside it.
