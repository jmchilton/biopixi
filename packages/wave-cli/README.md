# @biopixi/wave-cli

`wave-biopixi` turns the direct Conda roots in a Biopixi-compatible `pixi.toml` and `pixi.lock`
into a deterministic Wave build request for `linux/amd64`.

```console
$ wave-biopixi
wave.seqera.io/wt/…/wave/build:…
```

The wrapper requires definitive L2-or-higher evidence because hosted Wave must reach every Conda
artifact. An L1 project with path packages or local channels is refused: those inputs need a
local builder, which biopixi does not yet wrap.

## Usage

```text
wave-biopixi [project]
  --wave <executable>
  --print-command
  --dry-run
  --await [duration]
  --freeze
  --build-repo <repository>
  --build-template <template>
  --singularity
  --output <json|yaml>
```

`project` may be a directory or its `pixi.toml` and defaults to the current directory.

`--print-command` does not start Wave. Wave's `--dry-run` does contact the configured Wave service.
The wrapper forwards Wave's stdout, stderr, environment, and exit status, keeping stdout suitable
for command substitution. Configure credentials and endpoints with `TOWER_ACCESS_TOKEN`,
`TOWER_WORKSPACE_ID`, and `WAVE_ENDPOINT`; the wrapper deliberately has no credential flags.
Credential-bearing channel URLs are rejected at the hosted-build boundary and redacted anywhere a
command or diagnostic is rendered.

The wrapper always derives and owns `--conda-package`, `--conda-channels`, and `--platform`. Package
arguments contain the exact version and build from `pixi.lock`, while only direct roots are sent so
Wave resolves the transitive closure and records its own lock.

Wave's default build template is left unchanged. `--build-template conda/pixi:v1` opts into Wave's
Pixi template, which generates a new Wave-side lock and does not consume the project's `pixi.lock`.
