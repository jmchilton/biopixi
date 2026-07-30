# @biopixi/cli

`@biopixi/cli` exposes the `biopixi` executable and reusable command functions.

```bash
biopixi grade
biopixi grade project-a project-b
biopixi grade project-a --min-level 3
biopixi grade content/environments/* --source-root .
biopixi grade project-a --json
```

Without a directory, `grade` uses the current working directory.

## `--source-root`

Path dependencies are bounded by a source root. It defaults to the project being graded, which is
right for a self-contained project and wrong for a collection: when `content/environments/petls`
depends on a recipe under `recipes/`, that recipe is outside the project but inside the knowledge
base. `--source-root` widens the bound to any ancestor of every directory given.

The selected root is recorded on every result. A root that does not contain a project it was given
with is an invocation fault rather than a finding, and exits `64` without grading anything.

Every path dependency reached is checked against
[the profile's contract](../profile.md#path-dependency) and reported on a `builds:` line naming the
recipe that was read:

```text
L1  examples/l1-local-recipe
      · r-designit built from source at ./recipes/r-designit
      builds: r-designit 0.5.0 from recipes/r-designit/recipe.yaml
      capped by: r-designit built from source
                 ./recipes/r-designit
      → publish r-designit to conda-forge or bioconda — it is built from source at ./recipes/r-designit
      lint: r-designit carries build.skip in recipe.yaml — its one declared output may not be produced for the grading platform
```

A path dependency the profile cannot read is L0, whatever the rest of the manifest says.

## `--json`

Writes a [grade report](../schema/grade-report-v0.md) to stdout and nothing else; diagnostics stay
on stderr. The payload is written even when `--min-level` fails, since that is when a consumer is
most likely to want it. Its schema is published and committed, so a consumer can validate against a
fixed contract rather than reading fields hopefully.

## `--min-level`

Makes the command assert rather than report. Without it, `grade` always exits `0`.

| Exit | Meaning                                                                                            |
| ---- | -------------------------------------------------------------------------------------------------- |
| `0`  | every project met the threshold                                                                    |
| `1`  | a project is in profile and graded, but below the threshold                                        |
| `2`  | a project is in profile, but no solve backs a level — `UNRESOLVED`, `STALE`, or `UNSUPPORTED_LOCK` |
| `3`  | a project is outside profile v0, so it has no level to compare                                     |
| `4`  | `verify --require-verified` only: a container claim nobody could observe                           |
| `64` | the invocation itself was wrong, e.g. an unusable `--source-root`                                  |

Codes `1`–`3` answer PROFILE.md's three questions in order, and the earliest unanswered one wins
when directories disagree: a run containing both an out-of-profile project and a low-graded one
exits `3`, because that is the problem to fix first. They are kept apart because the fixes differ —
`2` means commit a lockfile, `3` means change the manifest, and only `1` means the environment
genuinely does not travel far enough.

## `biopixi verify`

The only command that reaches the network, and the only route to L4.

```bash
biopixi verify project-a
biopixi verify project-a --min-level 4
biopixi verify content/environments/* --source-root . --require-verified
```

L1–L3 are decidable from the lockfile, because the channel URL on every resolved artifact is
recorded there. L4 is not: it asserts that an image exists and can be pulled, which no file in a
project records. `grade` therefore stops at L3 and reports how far the container claim got —
`UNREGISTERED`, `INFERRED`, or `REGISTERED`. `verify` observes the registry and, on success,
records the manifest digest and promotes the result to L4.

Anonymity is the property under test. A registry that refuses an unauthenticated request has
established that the image is not publicly pullable, which is the negative that matters here,
whatever may exist behind those credentials. Only a transport failure leaves the question open,
and that is reported on stderr rather than counted against the project.

An observation never lowers a level: L1–L3 are statements about the lock, which a registry has
nothing to say about.

Programmatic callers can import `runGrade`, `renderGrade`, `buildProgram`, `buildReport`, or
`EXIT_CODES`.
