# Working with Pixi environments

**Start with `pixi.toml`; choose the next tool from the job in front of you.**

A Pixi project is useful before it reaches any particular biopixi level. You can run it, lock it,
share it, build its local packages, turn its Conda dependencies into a container, or use a
published BioContainer. The tools for those jobs do not all read the same input.

`pixi.toml` records what the project asks for. `pixi.lock` records the artifacts Pixi resolved.
Pixi and biopixi understand those files directly. Package builders, container builders, and
container runtimes work with the package targets or image URI derived from them.

> The manifest is the source of intent, not a universal container specification. Keep it and the
> lockfile authoritative; translate them at the boundary of each tool.

## The tool map

| What you want to do                | Tool                         | What the tool consumes                         | When it is useful                |
| ---------------------------------- | ---------------------------- | ---------------------------------------------- | -------------------------------- |
| Run the analysis                   | Pixi                         | `pixi.toml` and `pixi.lock`                    | Any valid Pixi project           |
| Inspect readiness and next actions | biopixi                      | `pixi.toml`, `pixi.lock`, and local recipes    | At every stage                   |
| Build a local Conda package        | pixi-build / rattler-build   | A package manifest and recipe                  | When a dependency is still local |
| Build and test a local container   | mulled-build                 | Conda targets and reachable channels           | L1 and later                     |
| Ask for a hosted container build   | Wave                         | Conda targets from publicly reachable channels | L2 and later                     |
| Pull a published BioContainer      | Docker, Podman, or Apptainer | A verified image URI                           | L4                               |

The levels are availability cues here, not instructions to perform every operation in order.

## Begin with a runnable manifest

The examples below use one small environment:

```toml
[workspace]
channels = ["conda-forge", "bioconda"]
platforms = ["linux-64"]

[dependencies]
bamtools = "==2.5.2"
samtools = "==1.17"

[tasks]
inspect = "samtools --version"
```

[Pixi](https://pixi.prefix.dev/latest/) reads this file directly. A named task is the cleanest
interface for a repeated analysis command:

```bash
pixi run inspect
```

For exploration, enter an activated environment:

```bash
pixi shell
```

Both commands install the environment and update the lockfile when needed; a separate
`pixi install` is optional. Once `pixi.lock` is committed, use `--locked` in CI or another
reproducibility-sensitive run. Pixi will refuse to proceed if the manifest and lockfile disagree:

```bash
pixi run --locked inspect
pixi install --locked
```

Use `pixi lock` when you intentionally change the manifest, review the lockfile diff, and commit
both files together. The
[Pixi run](https://pixi.prefix.dev/latest/reference/cli/pixi/run/),
[install](https://pixi.prefix.dev/latest/reference/cli/pixi/install/), and
[lock](https://pixi.prefix.dev/latest/reference/cli/pixi/lock/) references describe the complete
set of update modes.

This workflow is valuable even when the project is L0. L0 means the manifest is outside the
current biopixi profile; it does not mean Pixi cannot run it.

## Ask biopixi what can travel

biopixi reads the manifest and lockfile together:

```bash
biopixi grade .
```

The report names local packages that need to be built, the Conda target set that a container
builder needs, a candidate BioContainer URI when one can be calculated, and the next useful
action. It is the bridge between a flexible Pixi project and tools that expect Conda packages or
container names.

For the example above, the important handoff is:

```text
target: bamtools=2.5.2,samtools=1.17
```

That target is the environment's top-level Conda package set. It is not a replacement for
`pixi.lock`: Wave or mulled will resolve the package set for their own Linux container build,
while the lockfile remains the record of the Pixi solve.

Use JSON when another program needs the result:

```bash
biopixi grade . --json
```

## Choose Wave or mulled

Wave and mulled can both build a container from Conda targets, but they are useful at different
boundaries.

|                        | Wave                                         | mulled-build                                     |
| ---------------------- | -------------------------------------------- | ------------------------------------------------ |
| Where the build runs   | A hosted Wave service                        | The machine where you invoke it                  |
| Local prerequisites    | The Wave CLI and a network connection        | Conda, Docker, and involucro                     |
| Package inputs         | Channels the hosted service can reach        | Local `file://` channels or public channels      |
| Best fit               | Convenient builds from public package inputs | Local package testing and the BioContainers path |
| Earliest biopixi level | L2                                           | L1                                               |

Use Wave when every package is public and you want a container without assembling a local build
toolchain. Use mulled when a package still exists only on the current machine, or when you want to
exercise the same package boundary and naming conventions used by BioContainers. Neither choice
changes `pixi.toml`; both start from the Conda target that biopixi reports.

## Build a local package and container

A path dependency in `pixi.toml` keeps a package close to its source while its recipe is being
developed:

```toml
[workspace]
preview = ["pixi-build"]
channels = ["conda-forge", "bioconda"]
platforms = ["linux-64"]

[dependencies]
r-base = "4.4.*"
r-designit = { path = "./recipes/r-designit" }
```

Pixi builds path dependencies automatically when it installs or runs the environment. To create
an indexed local channel explicitly, current Pixi can build and publish the package there. Run
this Linux container-testing path on a `linux-64` build host or CI runner:

```bash
pixi publish \
  --path ./recipes/r-designit \
  --target-channel ./output \
  --target-platform linux-64
```

The package adapter points pixi-build at the recipe; the recipe remains the source of build,
runtime, test, and license metadata. The Pixi documentation covers the
[build model](https://pixi.prefix.dev/latest/build/getting_started/) and
[`pixi publish`](https://pixi.prefix.dev/latest/reference/cli/pixi/publish/) in detail.

Because mulled-build runs locally, it can install from that `file://` channel and exercise the
package in a minimal container:

```bash
mulled-build build \
  -c "file://$PWD/output,conda-forge,bioconda" \
  "r-designit=0.5.0"
```

This is useful before the package has a public home. It tests the runtime package boundary rather
than the richer build environment, which is why the same pattern is part of
[Bioconda's build system](https://bioconda.github.io/contributor/build-system.html).

## Ask Wave to build from public packages

Once every target is available from publicly reachable channels, pass the target reported by
biopixi to Wave:

```bash
wave \
  --conda-package bamtools=2.5.2 \
  --conda-package samtools=1.17
```

Wave returns an image URI that a standard container runtime can use. It is especially convenient
when you do not have a local Docker or Conda installation. Add `--conda-channels` when the targets
come from another public channel. Wave documents these inputs in its
[Conda build examples](https://docs.seqera.io/wave/cli/use-cases#build-a-container-from-conda-packages).

Wave does not read `pixi.toml` in this flow. biopixi exposes the package target; Wave turns that
public package input into a container. A local path dependency must become a local mulled build or
a publicly reachable package before Wave can use it.

## Run a published BioContainer

At L4, the build step has already happened. Confirm that the image is publicly available:

```bash
biopixi verify . --require-verified
```

Then use the verified URI with the runtime available on the machine. For example:

```bash
IMAGE="quay.io/biocontainers/mulled-v2-0560a8046fc82aa4338588eca29ff18edab2c5aa:b99cea629ebb7008000f322a53ee051ee7fee74a-0"

docker run --rm "$IMAGE" samtools --version
podman run --rm "$IMAGE" samtools --version
apptainer exec "docker://$IMAGE" samtools --version
```

[Docker](https://docs.docker.com/reference/cli/docker/container/run/) and
[Podman](https://docs.podman.io/en/latest/markdown/podman-run.1.html) consume the OCI URI directly.
[Apptainer](https://apptainer.org/docs/user/latest/docker_and_oci.html) adds the `docker://`
transport prefix and converts the OCI layers for an HPC-friendly execution environment.

For real data, bind the project or data directory into the container and make that location the
working directory. The exact mount flags belong to the runtime and the compute site; they are not
properties of `pixi.toml`.

## Read the levels as capabilities

The same project can remain useful while its available tools expand:

- **L0:** run and develop with Pixi, even though the project is outside the biopixi profile.
- **L1:** build local packages with pixi-build and test a local container with mulled.
- **L2:** use Wave or mulled from publicly reachable package inputs.
- **L3:** use community-maintained Conda inputs and prepare the standard BioContainers target.
- **L4:** pull the already-published image with the container runtime available at the compute site.

The practical default is simple: use Pixi while working on the analysis, use biopixi to expose the
next tool boundary, and use the least infrastructure that answers the present need.

For the story behind these stages, read
[From Pixi to BioContainers](from-pixi-to-biocontainers.md). For the naming and registry logic
inside biopixi, read [Container identity internals](../architecture/containers.md). To delegate
dependency hardening without stopping the analysis, read
[Agentic workflows](agentic-workflows.md).
