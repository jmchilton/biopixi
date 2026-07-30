<!-- Generated from /PROFILE.md by scripts/sync-profile-doc.mjs. Do not edit this copy. -->

# biopixi profile

**Status:** draft v0.1 — normative design contract; the prototype does not yet implement every
rule in this document.

This document defines the deliberately small part of `pixi.toml` for which biopixi assigns a
portability readiness level. It separates three questions that must not be conflated:

1. **Conformance:** is this manifest shape inside the biopixi profile?
2. **Evidence:** is there a current, complete solve that biopixi can inspect?
3. **Readiness:** given that solve, how far can the environment travel?

The words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** describe requirements of the profile.

## Scope

Profile v0 accepts a project-root `pixi.toml`. The **project root** is the directory containing
that manifest; it may be nested inside a version-control repository or a larger knowledge base.
biopixi MUST NOT assume that the project root is also the repository root. A Pixi configuration
embedded in `pyproject.toml` is valid Pixi but outside profile v0.

An invocation also has a **source root**, which bounds local path dependencies. It defaults to
the project root. A caller grading a collection MAY select a broader source root—for example, the
knowledge-base root when projects under `content/environments/` share packages under `recipes/`.
The selected source root MUST be an ancestor of the project root and MUST be recorded in the
result. It does not change dependency or platform composition.

A conformant workspace MUST declare:

- `[workspace]`;
- at least one channel;
- the default environment, containing at least one Conda dependency; and
- `linux-64`, with optional `osx-arm64`, as its effective platforms.

The manifest MUST also pass Pixi's own manifest validation. A TOML document that biopixi can
partially parse but Pixi rejects is L0.

Legacy `[project]` spelling, global Pixi manifests, and standalone package manifests that are not
selected by an environment are outside profile v0.

The portability guarantee covers the packages installed into an environment. It does not attest
to scientific correctness, security, licensing, data availability, task behavior, activation
scripts, or the continued availability of the selected source tree.

## Grading unit

The atomic grading unit is:

```text
platform
```

Profile v0 deliberately describes one distributable environment. Multiple Pixi environments are
valid Pixi, but they represent multiple container targets and make the workspace L0 under this
profile. Within the single environment, target tables can replace dependencies on individual
platforms, so biopixi MUST construct and grade each effective platform independently.

For example:

```toml
[workspace]
channels = ["conda-forge", "bioconda"]
platforms = ["linux-64", "osx-arm64"]

[dependencies]
python = "3.12.*"

[target.osx-arm64.dependencies]
python = "3.11.*"
```

This produces a `linux-64` grade using Python 3.12 and an `osx-arm64` grade using Python 3.11.

### Workspace result

`biopixi grade` SHOULD display the complete platform matrix. Its workspace summary is aggregated
in this order:

1. if any selected platform is out of profile, the workspace result is L0;
2. otherwise, if any selected platform lacks definitive lock evidence, the workspace has no numeric
   grade and reports those evidence states; and
3. otherwise, the workspace level is the minimum L1–L4 level across the selected platforms.

Future `--platform` selectors MAY restrict the matrix. A restricted result MUST name the
selection and MUST NOT be presented as the grade of the whole workspace.

L4 is available only for `linux-64` in profile v0. The optional `osx-arm64` platform can reach at
most L3. `noarch` packages inside either solve do not create another platform.

## Default environment only

Top-level dependency tables form Pixi's `default` feature, which Pixi places in its implicit
`default` environment. Profile v0 supports only that composition.

A conformant manifest:

- omits `[environments]`, or defines only `environments.default = []`;
- MUST NOT contain `no-default-feature`, regardless of its value;
- MUST NOT contain a named `[feature.<name>]` table;
- MUST NOT contain a named environment; and
- MUST NOT contain a `solve-group`.

Any violation makes the workspace L0, even if the named feature or environment would be unused.
biopixi MUST NOT choose a preferred environment or allow a selector to bypass this boundary.

The default environment missing from the lock makes every platform stale. A default environment
containing tasks but no Conda dependencies has no distributable Conda target and is L0.

## Platforms and target tables

`workspace.platforms` MUST be either `["linux-64"]` or those same platforms plus `osx-arm64`, in
either order. Any other platform set makes the workspace L0. Each declared platform is solved and
graded separately.

Generic dependency tables apply to every effective platform. A matching target table may add or
replace dependencies for that literal platform: a target entry with the same dependency name
replaces the generic entry, while a new name is added. A dependency that exists only under
`target.osx-arm64`, for example, MUST NOT affect the `linux-64` grade.

Workspace channels control the solve but do not themselves establish a level: the channel URL on
each resolved lock artifact remains authoritative for L1–L3.

System requirements and virtual packages SHOULD be reported because they can determine whether a
locked environment runs on a host. They do not currently change L0–L4.

## Dependency forms

The following rules apply after the matching target table has been applied for one grading
platform.

### Conda registry dependency

Accepted:

```toml
[dependencies]
samtools = "1.21.*"
```

The manifest constraint defines intent; the artifact recorded in `pixi.lock` is the evidence.
The resolved artifact URL, not an unqualified package name, determines channel provenance.

All direct and transitive Conda packages in the locked closure participate in the L1–L3
calculation. One lower-readiness transitive package caps the platform.

### Channel-qualified dependency

Accepted:

```toml
[dependencies]
bioformats2raw = { version = "0.9.4", channel = "ome" }
```

The qualifier MUST agree with the resolved channel in the lockfile. biopixi MUST preserve an
explicit `channel::package` prefix when computing a mulled target because channel prefixes are
part of the container identity.

Channel qualification does not promote a package:

- a package anonymously retrievable from a recognized public channel can reach L2;
- a package resolved from conda-forge or Bioconda, including a recognized mirror of those
  logical channels, can reach L3;
- a package from another public channel, such as `ome`, remains L2; and
- a private, authenticated, local, or otherwise non-public channel caps the platform at L1.

The current public-channel evidence snapshot defines which channel URLs are known to be
anonymously retrievable. URL syntax alone is not proof that a channel is public.

### Path dependency

Accepted only as an L1 source package:

```toml
[dependencies]
r-designit = { path = "./recipes/r-designit" }
```

A conformant path dependency MUST:

- be expressed as a relative path from the project root;
- resolve inside the selected source root after symlinks are resolved;
- point to a directory containing a Pixi package manifest;
- declare `[package].name` equal to the dependency name and a concrete `[package].version`;
- use a build backend supported by this profile;
- contain backend inputs that parse and render for the grading platform;
- render exactly one runtime output whose name and version agree with the package manifest;
- agree with the source record in `pixi.lock`; and
- have only supported Conda registry or recursively conformant path dependencies in the rendered
  runtime requirements.

Profile v0's supported local backend is `pixi-build-rattler-build`, with a `recipe.yaml` or
`recipe.yml` accepted by rattler-build. Merely having a source checkout, a package manifest, or a
file named `recipe.yaml` is not sufficient.

A valid path dependency caps the platform at L1 because rebuilding still requires the selected
source tree and a local build toolchain. An absolute path, a path escaping the selected source
root, a missing target, a package-name mismatch, or a source tree without a usable recipe is L0.

### Git or URL source dependency

Out of profile:

```toml
[dependencies]
tool-a = { git = "https://example.org/tool-a.git" }
tool-b = { url = "https://example.org/tool-b.tar.gz" }
```

A public source location is not a Conda package identity or a recipe. These forms are L0 until
they are represented by an in-source-tree recipe and a path dependency, or published to a Conda
channel.

### PyPI dependency

Out of profile:

```toml
[pypi-dependencies]
pysam = "==0.22.0"
```

Any `[pypi-dependencies]` entry effective on a platform makes that platform L0. This includes
registry wheels and PyPI `path`, `git`, `url`, and editable dependencies. Profile v0 requires a
Conda identity from which an `environment.yml` and mulled target can be derived.

Installing the Conda package named `pip` is not the same thing and is allowed. A task that runs
`pip install` is not a dependency declaration; it is outside the guarantee and produces a lint.

### Host and build dependencies

`host-dependencies` and `build-dependencies` belonging to a local package are inspected when
deciding whether its recipe is a usable L1 recipe. They are not added to the runtime container
target unless the built package declares them as runtime dependencies and they consequently
appear in the locked environment closure.

## Channels and readiness

For one conformant platform with complete evidence, levels are cumulative:

| Level  | Required condition                                                                                                                                   |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L1** | Every source and artifact is understood, but at least one dependency requires the selected source tree, a local build, or non-public infrastructure. |
| **L2** | Every artifact in the resolved closure is anonymously retrievable from a recognized public channel.                                                  |
| **L3** | L2 holds, and every artifact in the closure resolves from the logical conda-forge or Bioconda channels.                                              |
| **L4** | L3 holds on `linux-64`, and a BioContainer for the exact root target set is present in the verified publication metadata.                            |

The L4 root target set is the effective set of direct Conda dependencies for the platform, using
their locked versions. It is not the entire transitive closure: the container solve supplies that
closure. Explicit channel prefixes MUST be preserved in the target string and hash.

BioContainers' build machinery can historically contain a custom-channel target. That fact does
not allow L2 to skip L3. For example, the registered
`openjdk,ome::bioformats2raw=0.7.0` container remains L2 under this profile because `ome` is not
part of the conda-forge/Bioconda maintenance path.

## Lockfile evidence

L0 means **out of profile**. It must not also mean “the evidence is missing.” Evidence
completeness is a separate state.

### Missing lockfile

If `pixi.lock` is absent:

- manifest-level L0 violations MAY still be reported;
- no definitive L1–L4 level is assigned;
- the result is **UNRESOLVED**;
- manifest inspection MAY report a candidate ceiling, such as “at most L1 because of a path
  dependency”; and
- the remediation is `pixi lock`.

An unresolved public dependency is not relabeled L1 merely because its transitive closure is
unknown.

### Grade-stale lockfile

A lockfile is grade-stale when Pixi establishes that it would change for the current manifest.
biopixi MUST run `pixi lock --check` or the equivalent Pixi library operation before assigning a
definitive level. It MUST NOT use `--frozen`, because that deliberately accepts a stale lock.

After that whole-workspace check succeeds, biopixi MUST also verify for each platform:

- the environment and platform are present in the lock;
- the lock's direct Conda and PyPI requirements exactly match the effective manifest requirements,
  with neither missing nor obsolete entries;
- each locked version satisfies its effective manifest constraint;
- each channel-qualified dependency resolved from that channel;
- each path dependency resolved from its manifest-relative path inside the selected source root;
  and
- the environment closure contains no unresolved or unsupported package source.

Changes limited to tasks or activation scripts do not make a lockfile grade-stale because those
fields are outside the package portability guarantee.

If Pixi reports that the lock would change, or a platform check fails, no definitive L1–L4 level is
assigned. The result is **STALE**, names the mismatches, and recommends `pixi lock`. If the
freshness check cannot complete—for example, required channel metadata is unavailable—the result
is **UNRESOLVED**, not `STALE`. If the lockfile format is newer than biopixi can interpret, the
result is **UNSUPPORTED_LOCK**, not L0.

Pixi's own check remains authoritative for whole-workspace freshness. The platform checks exist
to prevent biopixi from accidentally grading a flattened or wrong-platform closure.

### Complete lockfile

A **DEFINITIVE** result requires a supported, grade-fresh lockfile and a public-metadata snapshot
whose revision and observation time are included in the output. A grade is explicitly relative
to that snapshot. Positive L2–L4 evidence MUST expire under a documented freshness policy or be
revalidated against its public endpoint; expired positive evidence cannot produce a definitive
promotion.

## Fields outside the level calculation

The following fields are allowed but are not covered by the portability guarantee:

- tasks and task dependencies;
- activation scripts and environment variables;
- system requirements and virtual-package overrides;
- package metadata unrelated to dependency resolution; and
- arbitrary source files in the selected source tree.

biopixi MAY lint these fields. In particular, install-like tasks (`pip install`, `make install`,
`curl | sh`, and similar commands) SHOULD warn that installation belongs in a recipe. A lint
does not change the numeric level unless the construct is also an effective dependency form
declared out of profile above.

## Required output

For every selected platform, a grade SHOULD include:

- conformance: conformant or the L0 reasons;
- evidence state: `DEFINITIVE`, `UNRESOLVED`, `STALE`, or `UNSUPPORTED_LOCK`;
- readiness level when definitive;
- the dependency and resolved artifact that cap L1–L3;
- the exact L4 root target string and publication evidence when applicable;
- the public-metadata revision and observation time; and
- actionable next steps.

The machine-readable form MUST preserve the per-platform matrix. It must not expose only the
workspace minimum.

## Prototype gaps

The current `packages/core/src/grade.ts` is a proof of concept. Before it claims conformance with
this profile, it needs the following changes:

| Area               | Current prototype                                                                   | Profile requirement                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Features           | rejects every named feature table                                                   | reject every named feature table                                                                                                   |
| Environments       | enforces the implicit default or `environments.default = []` boundary               | accept only the implicit default or `environments.default = []`; reject `no-default-feature`, named environments, and solve groups |
| Platforms          | validates the supported set but flattens all locked platforms together              | grade each platform independently                                                                                                  |
| Target tables      | applied to one grading platform, not to a per-platform matrix                       | apply top-level target tables per platform                                                                                         |
| Pixi validation    | never invokes Pixi; only the checked-in fixtures are validated against the real CLI | reject a manifest that Pixi itself rejects                                                                                         |
| Path dependencies  | trusts any locked source record                                                     | validate source-root containment, recipe, package name, and lock agreement                                                         |
| Channel qualifiers | uses the resolved channel for levels but can lose the prefix in container identity  | verify the qualifier and preserve it in mulled targets                                                                             |
| PyPI               | rejects top-level and effective platform-targeted entries                           | inspect top-level and platform-targeted dependencies independently                                                                 |
| Missing lock       | returns `UNRESOLVED` with no numeric level                                          | return `UNRESOLVED` with no numeric level                                                                                          |
| Stale lock         | returns `STALE`, but only checks that root names occur somewhere in the closure     | validate the default environment's effective requirements per platform                                                             |
| L4                 | reports snapshot revision and marks every container claim unverified                | report verified snapshot provenance and endpoint evidence                                                                          |
| CLI                | accepts directories only                                                            | add source-root and platform selection plus matrix/JSON output                                                                     |

## Pixi references

The profile follows Pixi's documented model:

- [default feature and environment behavior](https://pixi.sh/latest/workspace/multi_environment/);
- [platform-specific target configuration](https://pixi.sh/latest/workspace/multi_platform_configuration/);
- [Pixi build and path source dependencies](https://pixi.sh/latest/build/getting_started/); and
- [`--locked` and `--frozen` lockfile behavior](https://pixi.sh/latest/reference/cli/pixi/shell/).
