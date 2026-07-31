# @biopixi/wave-cli

`@biopixi/wave-cli` publishes the `wave-biopixi` executable. It reads a Biopixi-compatible Pixi
project, requires definitive L2-or-higher public-package evidence, and invokes Wave with exact
direct-root versions and builds:

```bash
wave-biopixi .
```

Use `--print-command` to inspect the derived argv without making a Wave request. `--dry-run` is
forwarded to Wave and still contacts the service.

The wrapper owns the Conda package list, channel order, and `linux/amd64` platform. It forwards
selected lifecycle controls (`--await`, `--freeze`, `--build-repo`, `--build-template`,
`--singularity`, and `--output`) and inherits Wave's streams, environment, and exit status.
Credentials remain environment-based through `TOWER_ACCESS_TOKEN`, `TOWER_WORKSPACE_ID`, and
`WAVE_ENDPOINT`. Credential-bearing channel URLs cannot cross the hosted-build boundary and are
redacted from rendered commands and diagnostics.

The hosted Wave service cannot reach path packages or local channels, so an L1 project is
refused. Build those locally with the [`mulled-biopixi`](../guides/building-with-mulled-biopixi.md)
companion tool, or with `mulled-build` directly.

[Build hosted containers with wave-biopixi](../guides/building-with-wave-biopixi.md) walks through
the workflow.
