---
"@biopixi/core": minor
"@biopixi/cli": minor
---

L4 now requires an observed container, and `biopixi verify` is the command that observes one.

`publication.verified` was a boolean that no code path could ever set to true — `grade` is offline
and only a registry lookup could have set it. Meanwhile L4's own definition required a container
"present in the verified publication metadata", so the top level was awarded on an inference the
same output labelled unverified. That is now resolved in favour of the definition: an offline grade
stops at L3 and carries a publication candidate, and only an observation promotes.

`Publication.verified` is replaced by `state`, one of `UNREGISTERED`, `INFERRED`, `REGISTERED`, or
`CONFIRMED`, plus optional `digest` and `observedAt`. `CONFIRMED` requires a recorded manifest
digest, so the claim is auditable rather than asserted. `examples/l4-single` and
`examples/l4-combination` therefore grade L3 offline and reach L4 through `verify`.

`biopixi verify` accepts `--min-level`, `--source-root`, `--json`, and `--require-verified`, which
fails with its own exit code (`4`) when a container claim could not be observed. An anonymous
authorization failure counts as not publicly pullable; only a transport failure is treated as
establishing nothing, and it never counts against a project.

PROFILE.md drops the requirement that positive L2–L4 evidence expire under a freshness policy. It
existed to stop a stale vendored snapshot from indefinitely supporting an unobserved L4, and
requiring the observation removes the need.
