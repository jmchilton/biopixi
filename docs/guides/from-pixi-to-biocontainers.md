# From Pixi to BioContainers

**Go fast alone. Go far together.**

[Pixi](https://pixi.sh) makes it practical to assemble a local environment around the work in
front of you. It can bring together existing Conda packages, packages from other ecosystems,
local source trees, and project tasks without requiring every dependency to be published first.
That flexibility is valuable: an analysis can start before all of its software has completed a
packaging journey.

When the work is ready for the wider scientific community, the environment needs more than a
successful local solve. Its dependencies need explicit build instructions, public package homes,
community maintenance, and eventually a published container that established workflow systems
can find and run.

biopixi guides that progression. Its levels are not a score for the science or a demand that every
experiment become a public container. They describe how much of the environment has moved from
one checkout into shared packaging infrastructure, and they identify a useful next step.

## The path in one minute

```text
a useful Pixi environment
    |
    | write local Conda recipes
    v
L1  locally packaged               mulled can build and test a local container
    |
    | publish the package
    v
L2  available from a public channel    Wave or mulled can build from public inputs
    |
    | contribute to conda-forge or Bioconda
    v
L3  maintained in the community ecosystem
    |
    | follow the BioContainers publication path
    v
L4  published and observed as a BioContainer
```

An environment may enter this path partway along. A Pixi project composed entirely of existing
conda-forge or Bioconda packages can already be L3. The levels describe the dependencies, not how
long the project has existed or how much work its author has done.

## Start with the environment the analysis needs

> The analysis runs in Pixi. Some dependencies may come from public Conda channels, while others
> may still be local source, a Git repository, PyPI, or another source that was expedient during
> development.

This is where Pixi's breadth matters most. It lets a researcher create and lock a useful working
environment without waiting for every new tool to be packaged upstream.

Some perfectly valid Pixi projects are **L0 — outside the biopixi profile**. L0 does not mean the
environment is broken or the analysis is bad. It means biopixi cannot yet make its focused
packaging claim about that environment. A source dependency without a usable recipe, an
install-like task, or a dependency form outside the current profile may be the reason.

The next step is not to make Pixi less flexible. It is to choose the dependency worth hardening
and give that dependency a package boundary.

## L1 — package it locally

> Every local dependency has a Conda recipe in the source tree. The environment can be built and
> tested as packages, but it still needs the repository and a local build toolchain.

A recipe turns an improvised installation into an explicit package build. It records the source,
build requirements, runtime requirements, tests, and output name in a form that can later move to
a package channel.

L1 is already useful. It catches undeclared dependencies and separates “this happened to work on
my machine” from “this package can be built again.” It also creates the first container-testing
opportunity.

At this stage, the package may exist only in a local `file://` channel. `mulled-build` runs on the
same machine, so it can install from that channel and build a container around the local package.
The hosted Wave service runs elsewhere and cannot see a path on the caller's filesystem, so it
cannot build from that local channel. This is a boundary of where the inputs are reachable, not a
judgment about either builder.

## L2 — publish the Conda package

> Every package is versioned and downloadable from a named public channel. A collaborator no
> longer needs the original checkout to obtain the environment.

Publishing the package removes the local filesystem boundary. The package might live in a
project, institutional, or other public Conda channel. As long as the service can reach that
channel, both Wave and mulled can use it to create a container.

[Wave](https://docs.seqera.io/wave/) is particularly convenient here: it can build a container
from a Conda package list without requiring a local Docker or Conda installation. Its
[freeze mode](https://docs.seqera.io/wave/features/container-freezes) can push the result to a
registry you control and return a stable URI. Wave-built images can therefore be persistent,
shared artifacts; biopixi does not treat them as inherently temporary.

At L2, the package publisher still owns the channel, builds, migrations, and long-term
maintenance. The environment is public, but it has not yet joined the community packaging path
that biopixi recognizes as its best-practice destination.

## L3 — join community packaging

> Every package in the resolved environment comes from conda-forge or Bioconda. Its recipes now
> participate in shared review, build, testing, migration, and maintenance infrastructure.

Moving a package to conda-forge or Bioconda is more than changing its download URL. It places the
recipe where maintainers can review updates, rebuild it when shared libraries change, and improve
it independently of the original analysis repository.

This is the point where the environment is ready for the standard Conda-based container tooling
used across bioinformatics. Wave can provision it on demand or freeze it to a registry. The
mulled tools can derive and build the canonical package-set target used by BioContainers and
Galaxy.

L3 is the packaging best practice in the biopixi model. The environment no longer depends on a
project-specific package channel, but it does not claim that a public container for this exact
set of top-level dependencies has already been published.

## L4 — publish the BioContainer

> The environment is L3, and a BioContainer for its exact target set has been observed at a public
> registry. A workflow can pull the pre-built artifact instead of asking a service or local
> toolchain to build it.

For a Bioconda package, the Bioconda build system publishes a corresponding container to Quay as
part of a successful package build. Conda-forge-only and multi-package environments can follow
the BioContainers
[`hash.tsv`](https://github.com/BioContainers/multi-package-containers/blob/master/combinations/hash.tsv)
workflow.

biopixi treats BioContainers as the best-practice publication destination because it connects the
environment to community package recipes, canonical mulled naming, public registry discovery,
and the Galaxy tool ecosystem. This is an ecosystem and provenance distinction—not a claim that
the container format is superior or that a Wave-frozen image cannot be durable.

L4 must be observed rather than inferred. `biopixi grade` can calculate the BioContainer that
should correspond to an L3 environment, but only `biopixi verify` can check the registry and
record the digest of an image that is actually available.

## Wave and mulled have complementary jobs

There is no need to pick one container builder for the whole journey.

| Situation                                                | Useful path                                            |
| -------------------------------------------------------- | ------------------------------------------------------ |
| A package exists only in a local `file://` channel       | Build and test locally with mulled                     |
| All package inputs are reachable through public channels | Build conveniently with Wave or locally with mulled    |
| A Wave-built image should have a stable home             | Use Wave freeze with a registry you control            |
| The environment is ready for community publication       | Use the Bioconda or BioContainers publication workflow |
| A BioContainer for the exact target already exists       | Pull and run the published image                       |

Wave offers an ergonomic path from public package inputs to a usable or frozen container. Mulled
provides the local testing path and the canonical naming machinery used by BioContainers. biopixi
keeps both because they help at different points.

## Stop where the work needs you to stop

Not every environment needs to reach L4 immediately. During exploration, a flexible Pixi project
may be exactly right. A private collaboration may only need a locally packaged dependency. A
public project may benefit from L2 while an upstream recipe is under review.

The point of the levels is to make those choices visible. biopixi tells you what the environment
already provides, what still depends on project-specific infrastructure, and which concrete
change would let the work travel farther into the wider scientific community.

For the exact mechanical rules behind each level, read the
[profile overview](../architecture/profile.md) or the
[normative specification](../profile.md). For implementation details about container construction
and naming, read [Container builders](../architecture/containers.md).
