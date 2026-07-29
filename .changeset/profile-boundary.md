---
"@biopixi/core": patch
---

Enforce the profile-v0 manifest boundary for the `[workspace]` spelling, features, environments,
solve groups, platforms, and effective PyPI dependencies. A dependency introduced only by a
top-level target table is now a root of the graded target set instead of no dependency at all.
