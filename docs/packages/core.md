# @biopixi/core

`@biopixi/core` owns the non-interactive grading model:

- parse `pixi.toml` and `pixi.lock`;
- classify resolved channel provenance;
- find the dependency that caps readiness;
- inspect the vendored BioContainers combination registry; and
- compute deterministic mulled-v2 image names; and
- project exact direct Conda roots for container adapters.

```typescript
import { grade, planCondaBuild, pullUri, v2ImageName } from "@biopixi/core";

const result = grade(".");
const build = planCondaBuild(".", { minimumLevel: 2 });
const image = v2ImageName([{ package: "samtools", version: "1.17" }]);
```

The package uses Node filesystem and crypto APIs. It performs no network calls.

See the generated [TypeDoc reference](../api/typedoc/index.html ":ignore") for exported types and
functions.
