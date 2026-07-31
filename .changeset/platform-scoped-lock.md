---
"@biopixi/core": minor
"@biopixi/cli": minor
---

Read the lock one platform at a time instead of flattening every platform together.

A lock records a separate solve per platform, and the same package can resolve to a different
build, or from a different channel, on each. `loadLock` collapsed them all into one list keyed by
package name, so the last platform written silently won. Pixi sorts platform keys, which made
`osx-arm64` win every time it was declared.

The visible symptom was a fabricated container identity: a project declaring both platforms was
graded on its macOS artifacts and emitted their build strings inside a linux-64 BioContainers URI,
naming a tag that cannot exist. `verify` would then report that container absent.

`loadLock` now takes the platform to read and reports whether the lock covers it at all; a lock
with no linux-64 section is `STALE` rather than graded from another platform's closure. Levels are
a statement about the linux-64 solve, so a declared `osx-arm64` is checked for conformance and left
ungraded — grading each platform independently is still an open gap.
