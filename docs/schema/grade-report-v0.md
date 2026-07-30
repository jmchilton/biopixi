<!-- Generated from packages/cli/src/report.ts by scripts/generate-schema.mjs. Do not edit. -->

# Grade report

`biopixi grade --json` writes one of these to stdout. It is the only output on stdout in that
mode; diagnostics go to stderr, and the payload is written even when `--min-level` fails, since
that is when a consumer needs it most.

The schema is committed at `docs/schema/grade-report-v0.schema.json` and published at
[`https://jmchilton.github.io/biopixi/schema/grade-report-v0.schema.json`](https://jmchilton.github.io/biopixi/schema/grade-report-v0.schema.json), which is the string every payload carries as its
`$schema`. Both this page and the schema are generated from the TypeScript types that produce
the payload, and CI fails if either has drifted from them.

A field marked _no_ under **Always present** is omitted entirely rather than set to null, except
where null is listed as one of its types.

## GradeReport

The `biopixi grade --json` payload.

The envelope carries the versions a consumer needs to interpret `results`: `profile` is the grading profile the levels are defined by, `biopixi` is the release that produced them.

| Field     | Type                                    | Always present | Description                                                  |
| --------- | --------------------------------------- | -------------- | ------------------------------------------------------------ |
| `$schema` | `string`                                | yes            | Where this payload's schema is published.                    |
| `biopixi` | `string`                                | yes            | The biopixi release that produced the results.               |
| `profile` | `string`                                | yes            | The grading profile the levels are defined by.               |
| `results` | [GradeReportEntry](#gradereportentry)[] | yes            | One entry per directory given, in the order they were given. |

## Cap

The dependency and resolved artifact holding a platform below L4.

| Field      | Type               | Always present | Description                                                          |
| ---------- | ------------------ | -------------- | -------------------------------------------------------------------- |
| `package`  | `string`           | yes            | The dependency name, as the manifest and the lock both spell it.     |
| `version`  | `string`           | no             | The locked version, absent only when the lock records none.          |
| `channel`  | `string` \| `null` | yes            | The channel it resolved from, or null when it was built from source. |
| `artifact` | `string`           | yes            | The resolved artifact URL, or the path it is built from.             |

## EvidenceState

Whether there is a solve biopixi can stand behind. Separate from readiness: a level is only meaningful when the evidence is `DEFINITIVE`.

One of: `DEFINITIVE`, `UNRESOLVED`, `STALE`, `UNSUPPORTED_LOCK`.

## GradeReportEntry

One graded directory: the path as the caller wrote it, plus everything grading decided.

Extends the verified shape so `grade` and `verify` emit one payload rather than two. The observation fields are simply absent when nothing reached a registry.

| Field              | Type                                      | Always present | Description                                                                                                                                                                                                                                                   |
| ------------------ | ----------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projectRoot`      | `string`                                  | yes            | The graded directory, absolute and symlink-resolved.                                                                                                                                                                                                          |
| `sourceRoot`       | `string`                                  | yes            | The absolute, symlink-resolved directory bounding local path dependencies. Defaults to the project root; a caller grading a collection may widen it to any ancestor. Recorded on every result because it is a property of the invocation, not of the project. |
| `conformant`       | `boolean`                                 | yes            | Whether the manifest is inside profile v0. Everything below is unanswerable when false.                                                                                                                                                                       |
| `evidenceState`    | [EvidenceState](#evidencestate) \| `null` | yes            | Whether a solve backs the result. Null when the manifest never got as far as being solved.                                                                                                                                                                    |
| `level`            | `number` \| `null`                        | yes            | How far the environment travels, 1–4. Null unless `evidenceState` is `DEFINITIVE`.                                                                                                                                                                            |
| `label`            | `string`                                  | yes            | The level, evidence state, or `L0`, as one token for display.                                                                                                                                                                                                 |
| `reasons`          | `string`[]                                | yes            | Why the result is what it is, most specific first.                                                                                                                                                                                                            |
| `lints`            | `string`[]                                | yes            | Portability concerns that did not change the result.                                                                                                                                                                                                          |
| `nextActions`      | `string`[]                                | yes            | What to do to move the result up, in the order it would have to be done.                                                                                                                                                                                      |
| `target`           | `string`                                  | no             | The `name=version` set a container claim would be built from.                                                                                                                                                                                                 |
| `cap`              | [Cap](#cap)                               | no             | What holds the environment at this level. Absent at L4, where nothing does.                                                                                                                                                                                   |
| `publication`      | [Publication](#publication)               | no             | The container this environment can be published as, and how that was arrived at.                                                                                                                                                                              |
| `snapshot`         | [MetadataSnapshot](#metadatasnapshot)     | no             | Provenance of the vendored metadata behind `publication`, when any was consulted.                                                                                                                                                                             |
| `pathDependencies` | [PathDependency](#pathdependency)[]       | no             | Every conformant local path dependency the manifest reaches, including those reached through another path dependency. Absent when the manifest declares none, which is the common case.                                                                       |
| `observation`      | [Observation](#observation)               | no             | Absent when the result carried no publication to observe.                                                                                                                                                                                                     |
| `directory`        | `string`                                  | yes            | As supplied on the command line, so a caller can match results back to its own arguments.                                                                                                                                                                     |

## MetadataSnapshot

Provenance of the vendored public metadata a claim rests on.

| Field          | Type               | Always present | Description                                                         |
| -------------- | ------------------ | -------------- | ------------------------------------------------------------------- |
| `file`         | `string`           | yes            | The vendored copy's filename inside this package.                   |
| `source`       | `string`           | yes            | The upstream repository it was taken from.                          |
| `path`         | `string`           | yes            | The path within that repository.                                    |
| `ref`          | `string`           | yes            | The branch or tag followed.                                         |
| `revision`     | `string` \| `null` | yes            | The exact upstream commit vendored, or null if it was not recorded. |
| `revisionDate` | `string`           | yes            | The date of that commit, ISO 8601.                                  |
| `fetched`      | `string`           | yes            | The date the copy was taken, ISO 8601.                              |
| `sha1`         | `string`           | yes            | SHA-1 of the vendored copy, so the claim stays checkable offline.   |

## Observation

What a registry lookup established. Absence and ignorance are deliberately not the same.

| Field | Type | Always present | Description |
| ----- | ---- | -------------- | ----------- |

## PathDependency

A local path dependency that satisfies the profile, recorded so a result can be audited.

| Field      | Type                                        | Always present | Description                                                                                                                                                                                                                   |
| ---------- | ------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`     | `string`                                    | yes            | The dependency name, as the manifest that declares it spells it.                                                                                                                                                              |
| `declared` | `string`                                    | yes            | The path as declared, relative to the manifest that declares it.                                                                                                                                                              |
| `resolved` | `string`                                    | yes            | The directory it points at, absolute and symlink-resolved.                                                                                                                                                                    |
| `version`  | `string`                                    | yes            | The concrete version its package manifest declares.                                                                                                                                                                           |
| `recipe`   | `string`                                    | yes            | The recipe file backing it, relative to the project root.                                                                                                                                                                     |
| `scope`    | [PathDependencyScope](#pathdependencyscope) | yes            | `workspace` when the graded manifest declares it, `package` when another local package does. Only a workspace declaration can be compared against the lock: Pixi resolves the rest at build time and never writes them there. |

## PathDependencyScope

Where a path dependency was declared, which decides what it can be compared against.

One of: `workspace`, `package`.

## Publication

A container claim and the basis for it. Naming an image is not the same as reaching a registry and finding it there, so the two are different states rather than one URI with a caveat.

| Field        | Type                                  | Always present | Description                                                                            |
| ------------ | ------------------------------------- | -------------- | -------------------------------------------------------------------------------------- |
| `uri`        | `string`                              | yes            | The container image this environment corresponds to.                                   |
| `state`      | [PublicationState](#publicationstate) | yes            | How much is known about the image. Only `CONFIRMED` supports L4.                       |
| `basis`      | `string`                              | yes            | How the URI was arrived at, so an unconfirmed claim can be judged rather than trusted. |
| `digest`     | `string`                              | no             | The manifest digest observed at the registry. Present only when `CONFIRMED`.           |
| `observedAt` | `string`                              | no             | When the registry was reached, ISO 8601. Present only when a registry was reached.     |

## PublicationState

How much is known about a container image, from the name alone up to having seen it.

Only `CONFIRMED` is L4, and only an observation produces it. The two middle states are the grounds on which an observation is worth attempting; neither is evidence the image exists.

One of: `UNREGISTERED`, `INFERRED`, `REGISTERED`, `CONFIRMED`.
