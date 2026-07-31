# Container identity internals

This page documents the container identity decisions implemented by `@biopixi/core`. It is for
developers changing the grader, publication states, or registry verification. For practical
instructions about choosing Wave or mulled and running the resulting image, read
[Working with Pixi environments](../guides/working-with-pixi-environments.md).

biopixi does not build containers. It combines the direct root Conda dependencies declared in
`pixi.toml` with their resolved versions and builds from `pixi.lock`, then produces a canonical
BioContainers target and, when the profile permits, an image URI. This separation keeps grading
independent of Docker, Conda, Wave, and mulled executables.

## The offline and network boundary

`grade` is pure and offline. It reads `pixi.toml`, `pixi.lock`, local package recipes, and the
vendored BioContainers combinations snapshot. It can establish L1–L3, construct a target string,
and calculate the image URI that would correspond to an eligible environment.

`verify` is the only network operation. It asks Quay whether that candidate is anonymously
pullable and records the manifest digest and observation time. Only an eligible, observed image
can promote an L3 result to L4. A registry response never changes the package evidence behind
L1–L3.

Keeping those operations separate makes offline grading deterministic and registry evidence
explicit.

## Selecting the container target

After the Linux solve passes the profile, the grader takes the direct root Conda dependencies and
renders each as `<name>=<resolved-version>`. The sorted values form the comma-separated `target`
reported by the CLI.

The resolved closure decides L2 or L3, but the root target set decides container identity:

- a package anywhere outside conda-forge and Bioconda caps the environment at L2;
- a single Bioconda root package receives the image name for that recipe build;
- a single conda-forge root package has a calculable name but no automatic BioContainers build;
- multiple root packages use the BioContainers `combinations/hash.tsv` registration and image
  build number when present; and
- an unregistered combination receives a candidate name with image build `0`, but remains L3.

The distinction appears in the publication state: `INFERRED`, `REGISTERED`, `UNREGISTERED`, or,
after a successful registry observation, `CONFIRMED`.

## Mulled naming

A mulled name is a function of the target set and nothing else. Targets are sorted by package
name, then:

- one target becomes `<package>:<version>--<build>` directly, with no hash; and
- several targets become repository `mulled-v2-<sha1>`, hashing the sorted package names joined by
  newlines, tagged with the same hash over their corresponding versions.

An explicit channel prefix is part of the package string, so `conda-forge::r-designit=0.5.0` and
`r-designit=0.5.0` are different names. The profile therefore requires the prefix to be preserved
verbatim when constructing a target string.

Three properties matter to the grader:

- **Order-invariant.** Sorting happens before hashing, so a target set has exactly one name.
- **Offline.** `mulled-hash --hash v1|v2` computes it, as does `v2ImageName` in
  [`@biopixi/core`](../packages/core.md), without a service, network, or build.
- **Provenance-free.** The name does not record which channel supplied the package. A local L1
  build can therefore have the same name as a later official image; local images must not be
  pushed into the public BioContainers namespace.

`pullUri` places the derived repository and tag under `quay.io/biocontainers/`.

## Why Wave identity is different

Wave hashes a **build request**, not a canonical package set. Its container ID includes the
rendered build file, Conda input, platform, target repository, and optional build context and
container configuration.

Two consequences prevent that ID from serving as the grade's container identity.

**Spelling affects the request.** The Conda input preserves order, so `samtools=1.17
bamtools=2.5.2` and `bamtools=2.5.2 samtools=1.17` can describe one environment while producing
different Wave requests. Channel order and explicit channel prefixes also affect the request.

**Some hashed inputs belong to the service.** The rendered build template and target repository
depend on the Wave deployment. The algorithm can be deterministic while still identifying a
snapshot of one deployment rather than a stable ecosystem contract.

A Wave URI is a useful build result to record. It is not the canonical name biopixi should derive
from a project offline.

## Core implementation surface

The relevant public functions and types are:

- `Target`, `v2ImageName`, and `pullUri` for canonical mulled identity;
- `planCondaBuild` for exact direct-root, channel, and platform projection;
- `grade` and its publication state for offline package and registration evidence; and
- `observe` and `verifyGrade` for registry observation and L4 promotion.

See the [`@biopixi/core` reference](../packages/core.md) and
[generated TypeDoc](../api/typedoc/index.html) for their signatures. The
[normative specification](../profile.md#channels-and-readiness) owns the behavior; this page
explains why the implementation is divided this way.
