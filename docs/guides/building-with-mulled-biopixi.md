# Build local containers with mulled-biopixi

**Turn a Biopixi-compatible Pixi project into a pinned, local `linux/amd64` container build.**

[`mulled-biopixi`](https://github.com/jmchilton/mulled-biopixi) is a companion project to
biopixi. biopixi grades the portability of an environment; `mulled-biopixi` takes an L1-or-higher
environment and exercises its Conda package boundary in a local container.

The tool reads `pixi.toml` and `pixi.lock`, derives exact mulled targets for the direct Conda
dependencies, prepares a local channel for direct path packages, and delegates the container
build to Galaxy's mulled implementation. It does not publish the resulting image or replace
biopixi's full profile validation.

## When to use it

Use `mulled-biopixi` when you want to:

- inspect the exact package targets that a Pixi project would send to mulled;
- build a local container from an L2 or L3 environment;
- build direct L1 path packages into a local channel before containerizing them; or
- test a command inside the resulting container before pursuing public package or BioContainer
  publication.

At L4, a public BioContainer already exists. Use `biopixi verify` and pull that image unless you
specifically need to reproduce the local build.

## Prerequisites

The project must have:

- `pixi.toml` and a current `pixi.lock` beside it;
- `linux-64` in `[workspace].platforms` and in the locked environment;
- a non-empty list of Conda channels; and
- only Conda-compatible direct dependencies for the effective Linux environment.

Run `pixi lock` after an intentional manifest change. Then grade the project before asking the
container tool to build it:

```bash
pixi lock
biopixi grade .
```

An actual build also requires a running Docker daemon. The produced image is always
`linux/amd64`; Docker Desktop can emulate that platform on Apple Silicon, although the build will
be slower than a native Linux build.

## Install the command

Install the latest release from
[PyPI](https://pypi.org/project/mulled-biopixi/) with an isolated Python tool installer:

```bash
uv tool install mulled-biopixi
```

`pipx install mulled-biopixi` is an equivalent option. The package supports Python 3.9 and later.
Upgrade an existing uv installation with:

```bash
uv tool upgrade mulled-biopixi
```

Pixi must also be available as `pixi` when the project contains direct path packages. Use
`--pixi /path/to/pixi` to select another executable.

## Preview the build plan

Start with a dry run from the directory containing `pixi.toml`:

```bash
mulled-biopixi --dry-run
```

The command prints:

- the resolved project directory;
- the pinned, sorted direct package targets;
- the channels passed to mulled; and
- any `pixi publish` command needed for a direct path package.

A dry run parses the project and loads the mulled integration, but it does not publish local
packages, pull base images, or invoke a Docker build. You can also point it at another project
directory or directly at its manifest:

```bash
mulled-biopixi ./analysis-project --dry-run
mulled-biopixi ./analysis-project/pixi.toml --dry-run
```

## Build and test the container

Use `build-and-test` when the environment has a small command that proves the packaged software
works:

```bash
mulled-biopixi \
  --command build-and-test \
  --test 'samtools --version'
```

Use the default `build` command when you only need the local image:

```bash
mulled-biopixi
```

Before a real build, the tool pre-pulls the Conda and destination base images for
`linux/amd64`. With the stable Galaxy API it also downloads a checksum-pinned Involucro 1.2.0
binary into `.mulled-biopixi/`; newer Galaxy implementations can express the target platform
directly. The compatibility choice is automatic.

Add the generated workspace to the consuming project's `.gitignore`:

```gitignore
.mulled-biopixi/
```

The directory contains regenerable local-channel and compatibility artifacts, not source inputs.

## Understand how the target is derived

`mulled-biopixi` keeps the manifest and lockfile in different roles:

| Input                                  | Role in the build plan                                           |
| -------------------------------------- | ---------------------------------------------------------------- |
| `[dependencies]`                       | Selects the direct package roots                                 |
| `[target.linux-64.dependencies]`       | Overrides roots for the container platform                       |
| `pixi.lock`                            | Supplies exact registry versions and build strings               |
| An explicit dependency `channel`       | Qualifies that package in the mulled target                      |
| A direct `{ path = "..." }` dependency | Supplies a local package to build into the project-local channel |
| `[workspace].channels`                 | Supplies the remaining channels used by Conda inside the image   |

Only direct roots are passed to mulled. Conda resolves their transitive closure inside the
image, matching the target-set rule used for Biopixi L4 container identity.

For example, a registry-only project can ask for ranges in its manifest:

```toml
[workspace]
channels = ["conda-forge", "bioconda"]
platforms = ["linux-64"]

[dependencies]
bamtools = "*"
samtools = ">=1.17"
```

The lockfile turns those requests into targets such as:

```text
bamtools=2.5.2--hdcf5f25_5,samtools=1.17--hd87286a_2
```

Do not copy that line back into the manifest. It is a container input derived from the committed
lock, while the manifest remains the source of dependency intent.

## Build an L1 path package automatically

For a direct path dependency, the package's own `pixi.toml` must declare the matching name and one
concrete version:

```toml
# pixi.toml
[workspace]
preview = ["pixi-build"]
channels = ["conda-forge", "bioconda"]
platforms = ["linux-64"]

[dependencies]
r-base = "4.4.*"
r-designit = { path = "./recipes/r-designit" }
```

```toml
# recipes/r-designit/pixi.toml
[package]
name = "r-designit"
version = "0.5.0"

[package.build]
backend = { name = "pixi-build-rattler-build", version = "*" }
```

During a real run, `mulled-biopixi` executes the equivalent of:

```bash
pixi publish \
  --path ./recipes/r-designit \
  --target-channel ./.mulled-biopixi/channel \
  --target-platform linux-64
```

It then places that indexed `file://` channel ahead of the workspace channels for the mulled
solve. Pass `--skip-local-publish` to reuse packages already present in the channel, or
`--local-channel PATH` to use a different channel directory.

## Useful options

| Option                     | Effect                                                        |
| -------------------------- | ------------------------------------------------------------- |
| `PROJECT`                  | Read a project directory or `pixi.toml`; defaults to `.`      |
| `--dry-run`                | Print the plan without package publication or container build |
| `--command build`          | Build the local image; this is the default                    |
| `--command build-and-test` | Build, then run the command supplied with `--test`            |
| `--test COMMAND`           | Set the in-container test command; defaults to `true`         |
| `--local-channel PATH`     | Override `.mulled-biopixi/channel`                            |
| `--skip-local-publish`     | Reuse an already populated local channel                      |
| `--pixi EXECUTABLE`        | Select the Pixi executable                                    |
| `--use-mamba`              | Ask mulled to install packages with Mamba                     |
| `--verbose`                | Increase output from the mulled build                         |

Run `mulled-biopixi --help` for the command's current CLI reference.

## Current boundaries

`mulled-biopixi` deliberately stops when translating the project would be ambiguous:

- PyPI dependencies are outside the Biopixi L1 Conda identity model.
- Direct `git` and `url` dependency specifications are unsupported.
- A local path package may not itself depend on another path package. Publish a recursive local
  package graph in dependency order before running the tool.
- The local channel is not uploaded anywhere.
- The supported mulled actions are `build` and `build-and-test`; the tool does not push images.
- A foreign-architecture build requires Docker's binfmt/QEMU support and may be substantially
  slower.

If the tool reports a stale or missing Linux solve, run `pixi lock` and review the lockfile. If it
reports a profile shape that biopixi should have caught, preserve the manifest and lockfile and
[open an issue](https://github.com/jmchilton/mulled-biopixi/issues) with the dry-run output.

For the broader progression from local packages to public BioContainers, read
[From Pixi to BioContainers](from-pixi-to-biocontainers.md). For manual Pixi, mulled, Wave, and
runtime commands, read
[Working with Pixi environments](working-with-pixi-environments.md).
