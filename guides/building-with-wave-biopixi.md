# Build hosted containers with wave-biopixi

**Turn a Biopixi-compatible Pixi project into a pinned, hosted `linux/amd64` container build.**

`wave-biopixi` ships from this repository as
[`@biopixi/wave-cli`](../packages/wave-cli.md). biopixi grades the portability of an environment;
`wave-biopixi` takes an L2-or-higher environment and asks [Wave](https://docs.seqera.io/wave),
Seqera's hosted container builder, to build it.

The tool reads `pixi.toml` and `pixi.lock`, derives exact Conda targets for the direct
dependencies, forwards the workspace channels in manifest order, and delegates the container build
to the Wave service. It does not build anything on the local machine, does not replace biopixi's
full profile validation, and does not verify the image it asks for.

## When to use it

Use `wave-biopixi` when you want to:

- inspect the exact package targets that a Pixi project would send to Wave;
- build a container from an L2 or L3 environment without assembling a local Conda and Docker
  toolchain;
- get a container from a machine that cannot run a `linux/amd64` build natively; or
- freeze a build into a registry you control, or request a Singularity image.

At L1, the inputs live only on the current machine and Wave cannot reach them. Use
[`mulled-biopixi`](building-with-mulled-biopixi.md) instead.

At L4, a public BioContainer already exists. Use `biopixi verify` and pull that image unless you
specifically need a container built from your own channel set.

## Prerequisites

The project must have:

- `pixi.toml` and a current `pixi.lock` beside it;
- `linux-64` in `[workspace].platforms` and in the locked environment;
- a non-empty list of Conda channels, each reachable from the hosted service without credentials;
  and
- only Conda-compatible direct dependencies for the effective Linux environment.

Run `pixi lock` after an intentional manifest change. Then grade the project before asking the
container tool to build it:

```bash
pixi lock
biopixi grade .
```

An actual build requires the [Wave CLI](https://docs.seqera.io/wave/cli/installation) and a
network connection; no Docker daemon and no local Conda installation are involved. Wave accepts
anonymous requests subject to its service limits. Set `TOWER_ACCESS_TOKEN` for a Seqera Platform
account, which raises those limits and is required to freeze a build into your own repository.

## Install the command

Install the latest release from
[npm](https://www.npmjs.com/package/@biopixi/wave-cli) with any Node package manager:

```bash
npm install -g @biopixi/wave-cli
```

`pnpm add -g @biopixi/wave-cli` is an equivalent option, and `npx @biopixi/wave-cli` runs the
command without installing it. The package requires Node.js 22 or newer. Upgrade an existing
global installation with:

```bash
npm update -g @biopixi/wave-cli
```

Wave must also be available as `wave`. Use `--wave /path/to/wave` to select another executable.

## Preview the request

Start from the directory containing `pixi.toml` and render the derived command:

```bash
wave-biopixi --print-command
```

The command prints the exact argv it would run:

```text
wave --conda-package bamtools=2.5.2=hdcf5f25_5 --conda-package samtools=1.17=hd87286a_2 --conda-channels conda-forge,bioconda --platform linux/amd64
```

`--print-command` parses the project and derives the request, but it contacts nothing. Wave's own
`--dry-run` is a different thing: it is forwarded to Wave and still makes a service request. You
can also point either form at another project directory or directly at its manifest:

```bash
wave-biopixi ./analysis-project --print-command
wave-biopixi ./analysis-project/pixi.toml --print-command
```

## Build the container

Run the command with no flags to make the request:

```bash
wave-biopixi
```

The wrapper forwards Wave's stdout, stderr, environment, and exit status, so the image URI stays
usable in a command substitution:

```bash
IMAGE="$(wave-biopixi --await 10m)"
docker run --rm "$IMAGE" samtools --version
```

`--await` waits for the build to finish rather than returning as soon as it is accepted. Wave's
default containers are ephemeral and expire; for anything durable, freeze the build into a
repository you control:

```bash
wave-biopixi --freeze --build-repo docker.io/my-org/my-analysis --await
```

Seqera documents the underlying request in its
[Wave CLI use cases](https://docs.seqera.io/wave/cli/use-cases#build-a-container-from-conda-packages).

## Understand how the request is derived

`wave-biopixi` keeps the manifest and lockfile in different roles:

| Input                                  | Role in the build request                                        |
| -------------------------------------- | ---------------------------------------------------------------- |
| `[dependencies]`                       | Selects the direct package roots                                 |
| `[target.linux-64.dependencies]`       | Overrides roots for the container platform                       |
| `pixi.lock`                            | Supplies the exact version and build string in `--conda-package` |
| An explicit dependency `channel`       | Qualifies that package in its `--conda-package` argument         |
| `[workspace].channels`                 | Supplies `--conda-channels`, in manifest order                   |
| A direct `{ path = "..." }` dependency | Unusable — the hosted service cannot reach a local package       |

Only direct roots are sent. Wave resolves their transitive closure inside its own build, matching
the target-set rule used for Biopixi L4 container identity.

For example, a registry-only project can ask for ranges in its manifest:

```toml
[workspace]
channels = ["conda-forge", "bioconda"]
platforms = ["linux-64"]

[dependencies]
bamtools = "*"
samtools = ">=1.17"
```

The lockfile turns those requests into pinned arguments:

```text
--conda-package bamtools=2.5.2=hdcf5f25_5 --conda-package samtools=1.17=hd87286a_2
```

Do not copy those pins back into the manifest. They are a container input derived from the
committed lock, while the manifest remains the source of dependency intent.

Wave never reads `pixi.lock`. The wrapper uses it to pin the request, and Wave records its own
solve for the image it builds. `--build-template conda/pixi:v1` opts into Wave's Pixi template,
which generates a Wave-side lock and likewise does not consume the project's.

## Understand why a project is refused

Wave builds on infrastructure that is not your machine, so every package must be fetchable from
there. `wave-biopixi` therefore requires definitive L2-or-higher evidence and refuses anything
below it with exit `65`.

A local path package or local channel cannot cross that boundary:

```console
$ wave-biopixi ./local-recipe-project
wave-biopixi: Wave requires definitive L2 or higher evidence; this project is L1. A local path package or local channel needs a local builder.
```

Publish the package to conda-forge or Bioconda to reach L2, or build the container locally with
[`mulled-biopixi`](building-with-mulled-biopixi.md), which can publish a path package into a
project-local channel first.

A channel URL carrying credentials cannot cross it either, because forwarding one would hand a
secret to a third-party service:

```console
$ wave-biopixi ./private-channel-project
wave-biopixi: Wave requires definitive L2 or higher evidence; this project is L1. Remove embedded channel credentials and configure authentication outside pixi.toml.
```

biopixi treats userinfo and any URL parameter on a channel as sensitive, since a token and a
harmless parameter are indistinguishable from the outside. Move the secret into Pixi's
authentication configuration and leave the bare channel URL in the manifest. Every rendered
command and diagnostic is redacted, so the secret does not appear in the refusal that names it.

Evidence that is merely unproven is refused the same way, with the grader's own wording:

```console
$ wave-biopixi ./unlocked-project
wave-biopixi: UNRESOLVED: no pixi.lock — publication is a claim about a solve, and there is no solve

$ wave-biopixi ./drifted-project
wave-biopixi: STALE: samtools requires version ==1.19, but the lock resolves 1.17
```

Run `pixi lock` and commit the result.

## Credentials and endpoint

The wrapper deliberately has no credential flags. It forwards the environment to Wave unchanged:

| Variable             | Effect                                              |
| -------------------- | --------------------------------------------------- |
| `TOWER_ACCESS_TOKEN` | Authenticate with Seqera Platform                   |
| `TOWER_WORKSPACE_ID` | Select the Seqera workspace for the build           |
| `WAVE_ENDPOINT`      | Point at an alternative or self-hosted Wave service |

## Useful options

| Option                        | Effect                                                    |
| ----------------------------- | --------------------------------------------------------- |
| `PROJECT`                     | Read a project directory or `pixi.toml`; defaults to `.`  |
| `--print-command`             | Print the derived Wave command without contacting Wave    |
| `--dry-run`                   | Forward Wave's dry run; this still contacts the service   |
| `--await [duration]`          | Wait for the build, optionally for a duration             |
| `--freeze`                    | Forward Wave freeze mode                                  |
| `--build-repo <repository>`   | Target repository for a frozen or Singularity image       |
| `--build-template <template>` | Select a Wave build template, for example `conda/pixi:v1` |
| `--singularity`               | Request a Singularity image                               |
| `--output <json\|yaml>`       | Set Wave's output format                                  |
| `--wave <executable>`         | Select the Wave executable                                |

Run `wave-biopixi --help` for the command's current CLI reference.

## Exit codes

The wrapper reports its own faults and otherwise gets out of the way:

| Exit    | Meaning                                                              |
| ------- | -------------------------------------------------------------------- |
| `0`     | Wave succeeded, or `--print-command` rendered the request            |
| `64`    | the invocation itself was wrong, for example an unknown option       |
| `65`    | project evidence is unusable — out of profile, unproven, or below L2 |
| `69`    | the Wave executable was not found                                    |
| `70`    | a fault in the wrapper itself                                        |
| `128+N` | Wave was terminated by signal `N`                                    |
| other   | Wave's own exit status, forwarded verbatim                           |

Every kind of unusable project evidence shares one code. Because Wave's status is passed through
untouched, the wrapper cannot also use the low numbers `biopixi grade` reserves for its verdicts
without making them ambiguous between a wrapper refusal and a Wave failure. The specific kind is
in the message.

## Current boundaries

`wave-biopixi` deliberately stops when translating the project would be ambiguous or unsafe:

- PyPI dependencies are outside the Biopixi L1 Conda identity model.
- Direct `git` and `url` dependency specifications are unsupported.
- Path packages and local channels are refused rather than partially translated.
- Channels with embedded credentials or URL parameters are refused rather than forwarded.
- The wrapper owns `--conda-package`, `--conda-channels`, and `--platform`; it does not accept a
  container file or arbitrary pass-through Wave arguments.
- Only `linux/amd64` is requested.
- The image is not verified, recorded, or written back into the project.

If the tool reports a stale or missing Linux solve, run `pixi lock` and review the lockfile. If it
reports a profile shape that biopixi should have caught, preserve the manifest and lockfile and
[open an issue](https://github.com/jmchilton/biopixi/issues) with the `--print-command` output.
That output is redacted, so it is safe to paste.

For the local counterpart of this workflow, read
[Build local containers with mulled-biopixi](building-with-mulled-biopixi.md). For the broader
progression from local packages to public BioContainers, read
[From Pixi to BioContainers](from-pixi-to-biocontainers.md). For manual Pixi, mulled, Wave, and
runtime commands, read
[Working with Pixi environments](working-with-pixi-environments.md).
