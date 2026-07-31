import type { CondaBuildPlan } from "@biopixi/core";
import { describe, expect, it } from "vitest";

import { buildWaveCommand, renderWaveCommand, waveTarget } from "../src/index.js";

const plan: CondaBuildPlan = {
  projectRoot: "/project",
  platform: "linux-64",
  channels: ["conda-forge", "bioconda"],
  targets: [
    { name: "bamtools", version: "2.5.2", build: "hdcf5f25_5" },
    { name: "samtools", version: "1.17", build: "hd87286a_2" },
  ],
};

describe("buildWaveCommand", () => {
  it("constructs the deterministic, build-pinned Wave request", () => {
    expect(buildWaveCommand(plan)).toEqual({
      executable: "wave",
      args: [
        "--conda-package",
        "bamtools=2.5.2=hdcf5f25_5",
        "--conda-package",
        "samtools=1.17=hd87286a_2",
        "--conda-channels",
        "conda-forge,bioconda",
        "--platform",
        "linux/amd64",
      ],
    });
  });

  it("preserves explicit channel qualifiers", () => {
    expect(
      waveTarget({
        name: "bioformats2raw",
        version: "0.7.0",
        build: "0",
        channel: "ome",
      }),
    ).toBe("ome::bioformats2raw=0.7.0=0");
  });

  it("forwards only the selected Wave lifecycle controls", () => {
    expect(
      buildWaveCommand(plan, {
        executable: "/opt/wave",
        dryRun: true,
        await: "15m",
        freeze: true,
        buildRepo: "registry.example/project",
        buildTemplate: "conda/pixi:v1",
        singularity: true,
        output: "json",
      }),
    ).toEqual({
      executable: "/opt/wave",
      args: [
        "--conda-package",
        "bamtools=2.5.2=hdcf5f25_5",
        "--conda-package",
        "samtools=1.17=hd87286a_2",
        "--conda-channels",
        "conda-forge,bioconda",
        "--platform",
        "linux/amd64",
        "--dry-run",
        "--await",
        "15m",
        "--freeze",
        "--build-repo",
        "registry.example/project",
        "--build-template",
        "conda/pixi:v1",
        "--singularity",
        "--output",
        "json",
      ],
    });
  });

  it("renders shell-safe output without changing argv execution", () => {
    const command = buildWaveCommand(plan, {
      executable: "wave tool",
      buildRepo: "registry.example/team's images",
    });
    expect(renderWaveCommand(command)).toContain("'wave tool'");
    expect(renderWaveCommand(command)).toContain("'registry.example/team'\"'\"'s images'");
    expect(command.args).toContain("registry.example/team's images");
  });

  it("redacts credentials and URL parameters from rendered commands", () => {
    const command = buildWaveCommand({
      ...plan,
      channels: [
        "https://user:secret@conda.anaconda.org/private?token=value#fragment",
        "conda-forge",
      ],
    });
    const rendered = renderWaveCommand(command);
    expect(rendered).toContain("https://conda.anaconda.org/private");
    expect(rendered).not.toContain("user");
    expect(rendered).not.toContain("secret");
    expect(rendered).not.toContain("token=value");
    expect(rendered).not.toContain("fragment");
    expect(command.args.join(" ")).toContain("secret");
  });
});
