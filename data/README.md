# Vendored public metadata

`grade` is pure — no conda, no Docker, no network. It still needs facts about the outside
world, so those facts are vendored here and refreshed out-of-band. Purity is about the
*toolchain*, not about pretending the world is knowable from a manifest alone.

| file | source | fetched |
|---|---|---|
| `biocontainers-hash.tsv` | `BioContainers/multi-package-containers` `combinations/hash.tsv` @ master | 2026-07-28 |

Refreshing is a `build`-side concern (network), never a `grade`-side one. Staleness is a
one-way error: a combination registered after the snapshot grades L3 instead of L4 — the
level is understated, never overstated.
