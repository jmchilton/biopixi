---
"@biopixi/core": minor
"@biopixi/cli": minor
---

Enforce profile v0's path-dependency contract. A local path dependency is now checked rather than
trusted: it must be relative, resolve inside the selected source root, hold a Pixi package manifest
whose name and concrete version agree with the dependency, use `pixi-build-rattler-build`, and carry
a recipe that parses and declares exactly one output. Recursion follows the package manifest's own
`[package.*-dependencies]` tables, which is where a nested source package is declared and where the
lock never records it.

A workspace declaring a path dependency without `preview = ["pixi-build"]` is now L0, because Pixi
refuses to solve a conda source dependency without it.

Conformant path dependencies are reported on the result as `pathDependencies` and in the JSON
report. A `build.skip` expression produces a lint, and a lock whose source record names a different
directory is reported as `STALE` rather than as an out-of-profile manifest.
