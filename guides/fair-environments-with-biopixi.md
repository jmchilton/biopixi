# FAIR environments with biopixi

**A locked environment is not automatically FAIR. Make its software legible, retrievable, and
reusable beyond one checkout.**

The FAIR principles ask whether a digital research object is Findable, Accessible, Interoperable,
and Reusable by people and machines. They are guideposts, not a technology prescription or a
quality certificate. A FAIR object can still be scientifically wrong, and an analysis can be
useful before every part of it has been prepared for reuse.

A computational environment is one part of that research object. `pixi.toml` records what the
project asks for, while `pixi.lock` records the exact software artifacts Pixi resolved. biopixi
reads that evidence and reports how much of the package closure has moved from one source tree
into public, community packaging and container infrastructure.

That makes an important part of FAIRness inspectable. It does not make the whole research project
FAIR.

> biopixi is a portability guide, not a FAIR score. Its levels primarily strengthen access,
> interoperability, and reuse; finding and understanding the environment still depend on the
> record published around it.

## The environment is one layer of the record

Reusing an analysis requires more than reinstalling its command-line tools. It requires a record
that identifies the work, an environment that supplies its software, and enough analysis context
to understand what was run.

<div class="fair-stack" role="group" aria-label="Three layers of a reusable computational research record">
  <section class="fair-stack__layer fair-stack__layer--record">
    <span class="fair-stack__label">findable record</span>
    <h3>Describe and identify</h3>
    <p>Release, persistent identifier, citation, license, authors, and purpose.</p>
  </section>
  <section class="fair-stack__layer fair-stack__layer--environment">
    <span class="fair-stack__label">portable environment</span>
    <h3>Resolve and distribute</h3>
    <p><code>pixi.toml</code>, <code>pixi.lock</code>, packages, and a published container.</p>
    <strong class="fair-stack__scope">biopixi grades this layer</strong>
  </section>
  <section class="fair-stack__layer fair-stack__layer--analysis">
    <span class="fair-stack__label">reproducible analysis</span>
    <h3>Explain and verify</h3>
    <p>Workflow, inputs, parameters, run provenance, expected outputs, and tests.</p>
  </section>
</div>

The layers reinforce one another but do not substitute for one another. A DOI cannot recreate a
missing package. A container cannot explain which data and parameters produced a figure. A
lockfile can preserve an exact solve without making the project discoverable.

The original
[FAIR Guiding Principles](https://www.nature.com/articles/sdata201618) emphasized
**machine-actionability**: a machine should be able to identify a digital object, understand
enough metadata to judge whether it is useful, retrieve it, and take appropriate action. The later
[FAIR Principles for Research Software](https://www.nature.com/articles/s41597-022-01710-x)
adapt that goal to software's executable, composite, and versioned nature. A software environment
sits between the two: it is structured metadata about software and a recipe for obtaining an
executable collection of it.

## Read the four letters against the environment

### Findable — publish the record around the solve

Neither Pixi nor biopixi assigns a persistent identifier or registers an environment in a
searchable research catalog. A repository URL helps people find current work, but a tagged,
archived release gives a particular state a durable identity. A
[`CITATION.cff`](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-citation-files)
file connects that identity to its title, version, authors, and preferred citation.

For a research release, publish at least:

- a clear project description and the environment's purpose;
- `pixi.toml` and the matching `pixi.lock`;
- a version, authorship, license, and citation record; and
- links to the workflow, data, or publication the environment supports.

Services such as
[Zenodo](https://docs.github.com/en/repositories/archiving-a-github-repository/referencing-and-citing-content)
can archive a public repository release and issue a DOI. That DOI names the published record; it
does not replace the package identities and container digest inside it.

### Accessible — remove the original-machine boundary

FAIR accessibility means an identified object can be retrieved through a standard protocol, with
authentication allowed where necessary. FAIR does not require everything to be open. The biopixi
ladder makes a narrower choice: it values anonymous public package and container access because it
is measuring how far an environment can travel without project-specific infrastructure.

At L1, a collaborator may still need the original source tree or a private channel. At L2, every
locked package is anonymously retrievable from a public Conda channel. At L4, biopixi has observed
the candidate container in a public registry and records both its manifest digest and the time of
observation.

L3 and L4 also build on more than one artifact form. The software remains available as Conda
packages, BioContainers publishes Docker/OCI images on Quay, and Galaxy distributes derived
Singularity/Apptainer copies from its
[container depot](https://depot.galaxyproject.org/singularity/) and shared CVMFS cache.
BioContainers was already a
[published community project in 2017](https://doi.org/10.1093/bioinformatics/btx192), and
[current Galaxy infrastructure](https://docs.galaxyproject.org/en/latest/admin/container_resolvers.html)
still resolves and caches those images. That redundant, long-running distribution path is a
stronger access story than a project-owned image alone; the manifest and lockfile retain the
reconstruction record around it.

### Interoperable — cross boundaries through shared formats

`pixi.toml` and `pixi.lock` give tools a structured description of the environment. Conda packages
separate software into named, versioned artifacts with dependency metadata. At L3, the entire
locked closure comes from conda-forge or Bioconda, where shared recipes, review, and build
infrastructure replace project-specific installation knowledge.

The container handoff crosses another boundary. biopixi derives the same Conda target form used by
Wave and mulled, then connects ecosystem-ready targets to BioContainers naming and publication.
The resulting image can be consumed by standard container runtimes and workflow systems. The
[OCI Image Specification](https://specs.opencontainers.org/image-spec/) defines the interoperable
image model beneath that exchange.

This is software interoperability. It says nothing about whether an analysis reads and writes
domain-standard data formats or exposes a reusable workflow interface; document those properties
with the analysis itself.

### Reusable — preserve evidence, not only a package list

A version constraint records intent. A lockfile records the selected versions, builds, platforms,
and artifact locations. biopixi checks that the solve still describes the manifest before it
assigns a level, and names the package or publication boundary that prevents the environment from
traveling farther.

Packaging adds another kind of evidence. A Conda recipe describes source, build and runtime
requirements, tests, and package metadata. Bioconda's
[community guidelines](https://bioconda.github.io/contributor/guidelines.html) require stable
source URLs and hashes, license information, dependencies, and an adequate installation test. Its
[build system](https://bioconda.github.io/contributor/build-system.html) turns reviewed recipes
into public packages and BioContainers.

That makes the software closure more reusable. It does not establish that the analysis is
scientifically correct, that every package license is compatible with the intended use, or that
the same inputs will produce the same outputs on every machine.

## What changes along the biopixi path

The levels are cumulative portability claims, not cumulative FAIR grades.

| State  | FAIR-relevant gain                                                           | Boundary that remains                                                        |
| ------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **L0** | The Pixi project may still be documented, archived, and useful.              | biopixi cannot make its focused packaging claim.                             |
| **L1** | Every local dependency has an explicit, inspectable package recipe.          | Rebuilding still needs the source tree or other non-public package access.   |
| **L2** | The complete locked package closure is publicly retrievable.                 | Publication remains project-owned rather than community-maintained.          |
| **L3** | The closure uses shared conda-forge or Bioconda packaging infrastructure.    | The exact environment may not yet have a published container.                |
| **L4** | A public BioContainer has been observed and identified by a registry digest. | Data, parameters, workflow provenance, correctness, and preservation remain. |

Because the dimensions are independent, a well-described and archived L1 project may be more
findable than an undocumented L4 image. L4 answers one valuable question—whether the packaged
software environment can be pulled now—not every question FAIR asks.

## Publish a useful environment record

A small research project can make the boundaries visible without adopting a large metadata
system:

```text
analysis-project/
├── README.md
├── LICENSE
├── CITATION.cff
├── pixi.toml
├── pixi.lock
├── workflow-or-scripts/
└── results-and-provenance/
```

Use the manifest and lockfile together. When dependencies change, update the lock intentionally,
review its diff, and commit both files:

```bash
pixi lock
pixi run --locked <analysis-or-test-task>
```

Then ask biopixi which package-access boundary the locked closure reaches:

```bash
biopixi grade .
biopixi grade . --json
```

The JSON form is useful for CI and other tools: it identifies its schema, biopixi version, profile,
evidence state, reasons, and next actions. It also records invocation-local absolute paths, so do
not treat the unmodified payload as archival metadata for a release.

Move dependencies toward L2 or L3 only when broader reuse justifies the publication and
maintenance work. When an L3 environment has a container candidate, observe it rather than
assuming that a calculated name exists:

```bash
biopixi verify . --require-verified
```

For a research release, retain the verified digest alongside the release metadata and describe
the named task, expected inputs and outputs, supported platforms, and relevant system
requirements. Archive the release and connect it to the data, workflow, and publication it
supports. For a larger bundle, a format such as
[RO-Crate](https://www.researchobject.org/ro-crate/specification.html) can describe those objects
and their relationships without turning the environment manifest into a second research-object
format.

## What biopixi does not claim

The boundary matters as much as the grade:

- **FAIR does not mean correct.** Rich metadata and public artifacts can faithfully preserve a
  mistaken method.
- **Locked does not mean permanently available.** A lock records exact sources; an archive and
  maintained repositories keep those sources retrievable.
- **Containerized does not mean reproducible.** Kernels, hardware, external services, random
  state, inputs, and parameters can still change results.
- **L3+ carries community-enforced license evidence, not a full compatibility audit.**
  [conda-forge](https://conda-forge.org/docs/maintainer/guidelines/#reviewing-recipes) and
  [Bioconda](https://bioconda.github.io/contributor/guidelines.html) review licenses for
  redistribution and require package metadata and license files. biopixi does not independently
  verify cross-package license compatibility or the research project's own reuse terms.
- **L4 does not describe the analysis.** It does not capture workflow logic, input data, parameter
  choices, output provenance, or scientific validation.
- **A lower level is not a judgment on the science.** Private data, active software development,
  or an upstream licensing decision may make L1 or L2 the responsible stopping point.

The useful claim is deliberately smaller: biopixi makes the software distribution boundary
explicit, checks it against a concrete solve, and shows the next step toward shared
infrastructure. Pair that evidence with a findable project record and a well-described analysis,
and the environment becomes a durable part of FAIR research rather than an installation note
someone else must reinterpret.

For the packaging journey behind the levels, read
[From Pixi to BioContainers](from-pixi-to-biocontainers.md). For installation, build, and runtime
commands, read [Working with Pixi environments](working-with-pixi-environments.md). For the exact
scope of every claim, read the [profile overview](../architecture/profile.md) and
[normative specification](../profile.md).
