# Profile and readiness

Pixi deliberately supports many project shapes. biopixi supports a smaller profile whose
portability properties can be explained and tested mechanically.

The current profile:

- grades each supported platform independently;
- requires `linux-64` and permits optional `osx-arm64`;
- supports only Pixi's default feature and default environment;
- treats local, public, community-maintained, and container-published artifacts as cumulative
  readiness stages; and
- separates profile conformance from lockfile and public-metadata evidence.

Read the [complete normative specification](../profile.md) for the exact rules covering path
dependencies, channel-qualified packages, PyPI dependencies, and missing or stale locks.

## Levels

| Level | Meaning                                                                              |
| ----- | ------------------------------------------------------------------------------------ |
| L0    | Outside the supported manifest profile                                               |
| L1    | Packaged locally; the selected source tree or local infrastructure is still required |
| L2    | Every artifact is anonymously available from a named public channel                  |
| L3    | The complete closure resolves from conda-forge or Bioconda                           |
| L4    | L3 holds and the exact Linux target has a verified BioContainer                      |

The TypeScript grader is intentionally labeled a prototype until the implementation gaps at the
end of the [normative specification](../profile.md#prototype-gaps) are closed.
