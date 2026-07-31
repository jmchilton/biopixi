# Container builders

biopixi never builds a container. It derives the name of the container an environment should
have, and points at whichever tool can build it at that environment's readiness level. Two tools
do that job — [Wave](https://seqera.io/wave/) and the
[mulled](https://github.com/BioContainers/multi-package-containers) family — and biopixi keeps
both because they fail in opposite places.

## Which one, when

|                          | Wave                                                               | mulled-\*                                       |
| ------------------------ | ------------------------------------------------------------------ | ----------------------------------------------- |
| local prerequisites      | one static binary + network                                        | conda **+** Docker **+** involucro              |
| built for                | a developer who wants a container                                  | BioContainers/Galaxy CI and channel maintenance |
| L1 (local channel)       | **blind** — remote service, cannot read `file://`                  | **works**                                       |
| L2 (public channel)      | works when the service can reach the explicitly configured channel | **works**, with the channel supplied            |
| L3 (ecosystem-ready)     | one call, hosted, frozen                                           | standard community inputs                       |
| L4 (ecosystem-published) | redundant                                                          | already built and distributed                   |
| name identifies          | the build request                                                  | the package set, sorted and canonicalized       |
| name derivable offline   | yes, but it pins a deployment snapshot rather than a contract      | **yes**, `mulled-hash --hash v1\|v2`            |

Wave is the better ergonomic default once every channel is publicly reachable. mulled is the only
thing that works at L1. **Wave for reach, mulled for durability.**

## How mulled builds

`mulled-build` drives involucro, which uses a local Docker daemon to install the requested Conda
targets into a minimal image. Channels are supplied on the command line and can include a
`file://` path, so a package that exists only as local build output is buildable:

```bash
rattler-build build --recipe recipes/r-designit/recipe.yaml   # -> output/
rattler-index fs ./output
mulled-build build -c file://$PWD/output,conda-forge,bioconda 'r-designit=0.5.0'
```

Everything happens on the machine running the command, which is both the cost — conda, Docker,
and involucro must all be installed — and the reason it is the only builder available at L1.

## How mulled names

A mulled name is a function of the target set and nothing else. Targets are sorted by package
name, then:

- **one target** becomes `<package>:<version>--<build>` directly, with no hash;
- **several targets** become repository `mulled-v2-<sha1>`, hashing the sorted package names
  joined by newlines, tagged with the same hash over their corresponding versions.

An explicit channel prefix is part of the package string, so `conda-forge::r-designit=0.5.0` and
`r-designit=0.5.0` are different names. This is why the profile requires the prefix to be
preserved verbatim when a target string is built.

Three properties follow, and biopixi depends on all three:

- **Order-invariant.** Sorting happens before hashing, so a target set has exactly one name.
- **Offline.** `mulled-hash --hash v1|v2` computes it, as does `v2ImageName` in
  [`@biopixi/core`](../packages/core.md) — no service, no network, no build.
- **Provenance-free.** The name says nothing about where the packages came from, so a local L1
  build is name-identical to the official image. That is what makes promotion pin-transparent,
  and also why L1 images must never be pushed to a public registry.

## How Wave builds

Wave is a hosted build service. The client sends a request — the Conda package list, a platform,
a target repository — and the service renders a Dockerfile from a template it ships, builds it,
pushes the result, and with `--freeze` returns a permanent name:

```bash
wave --conda-package r-designit=0.5.0 --freeze --await
```

No local conda, Docker, or involucro; one static binary and a network connection. The trade is
that the build runs on the service, so it can only use channels the service itself can reach. A
`file://` channel is invisible to it, which is what makes Wave blind at L1.

The Dockerfile template is versioned and selectable — `conda/micromamba:v2` is the current
default, alongside `conda/micromamba:v1`, `conda/pixi:v1`, and `cran/installr:v1`.

## How Wave names

Wave hashes the **build request**, not the package set. `makeContainerId` assembles an ordered
map of the rendered Dockerfile, the Conda file, the platform, the target repository, and
optionally a build context and container config, then digests it with SipHash-2-4 over the
UTF-16LE entries.

Two consequences matter for grading.

**The name identifies a request, not an environment.** The Conda file is the package list in the
order it was given, unsorted, so `samtools=1.17 bamtools=2.5.2` and `bamtools=2.5.2
samtools=1.17` are one environment with two Wave names. Reordering channels or writing a channel
prefix changes the name the same way. mulled canonicalizes first and produces one name for all of
these spellings.

**Two hashed fields belong to the service, not to the project.** The Dockerfile comes from a
template inside the Wave deployment, and the repository path comes from that deployment's
configuration and the selected `--name-strategy`. The algorithm is deterministic and can be
reimplemented offline, but what such a reimplementation pins is a snapshot of a particular Wave
deployment rather than a published contract — a template version bump moves every name derived
from it.

This is the reason biopixi derives container identity from mulled: a name that is a function of
the package set alone is the one that can appear in a grade, be recomputed years later, and mean
the same thing. A Wave name is a build result worth recording, not a value to compute.

## Related

- [Profile and readiness](profile.md) — what each level requires
- [Normative specification](../profile.md#channels-and-readiness) — the L4 root target set rules
