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

For path packages and local channels, use `mulled-biopixi`; the hosted Wave service cannot reach
those inputs.
