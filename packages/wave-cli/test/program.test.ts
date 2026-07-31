import { mkdtempSync, writeFileSync } from "node:fs";
import { constants as osConstants, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  buildProgram,
  EXIT_CODES,
  runProgram,
  runWaveBiopixi,
  type WaveCommandIo,
  type WaveRunner,
} from "../src/index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const l3 = join(root, "examples/l3-ecosystem-ready");
const l1 = join(root, "examples/l1-local-recipe");

function project(manifest: string, lock?: string): string {
  const directory = mkdtempSync(join(tmpdir(), "wave-biopixi-program-"));
  writeFileSync(join(directory, "pixi.toml"), manifest);
  if (lock !== undefined) {
    writeFileSync(join(directory, "pixi.lock"), lock);
  }
  return directory;
}

function capturingIo(): WaveCommandIo & { stdoutMessages: string[]; stderrMessages: string[] } {
  const stdoutMessages: string[] = [];
  const stderrMessages: string[] = [];
  return {
    stdoutMessages,
    stderrMessages,
    stdout: (message) => stdoutMessages.push(message),
    stderr: (message) => stderrMessages.push(message),
  };
}

describe("runWaveBiopixi", () => {
  it("executes with an argv array, inherited streams, environment, and clean wrapper output", () => {
    const io = capturingIo();
    const env = { WAVE_ENDPOINT: "https://wave.example" };
    const runner = vi.fn<WaveRunner>(() => ({ status: 0, signal: null, error: undefined }));

    expect(runWaveBiopixi(l3, {}, { io, env, runner })).toBe(0);
    expect(runner).toHaveBeenCalledOnce();
    expect(runner.mock.calls[0]?.[0]).toBe("wave");
    expect(runner.mock.calls[0]?.[1]).toContain("samtools=1.17=hd87286a_2");
    expect(runner.mock.calls[0]?.[2]).toEqual({ stdio: "inherit", env });
    expect(io.stdoutMessages).toEqual([]);
    expect(io.stderrMessages).toEqual([]);
  });

  it("prints without starting Wave", () => {
    const io = capturingIo();
    const runner = vi.fn<WaveRunner>();
    expect(
      runWaveBiopixi(l3, { printCommand: true, executable: "wave tool" }, { io, runner }),
    ).toBe(0);
    expect(runner).not.toHaveBeenCalled();
    expect(io.stdoutMessages.join("")).toContain("'wave tool' --conda-package");
    expect(io.stderrMessages).toEqual([]);
  });

  it("distinguishes a missing Wave executable and propagates child failures", () => {
    const missingIo = capturingIo();
    const missing = Object.assign(new Error("spawn missing ENOENT"), { code: "ENOENT" });
    const missingRunner: WaveRunner = () => ({ status: null, signal: null, error: missing });
    expect(runWaveBiopixi(l3, {}, { io: missingIo, runner: missingRunner })).toBe(
      EXIT_CODES.unavailable,
    );
    expect(missingIo.stderrMessages.join("")).toContain("Wave executable not found");

    const failedRunner: WaveRunner = () => ({ status: 23, signal: null, error: undefined });
    expect(runWaveBiopixi(l3, {}, { runner: failedRunner, io: capturingIo() })).toBe(23);

    const signaledIo = capturingIo();
    const signaledRunner: WaveRunner = () => ({
      status: null,
      signal: "SIGTERM",
      error: undefined,
    });
    expect(runWaveBiopixi(l3, {}, { runner: signaledRunner, io: signaledIo })).toBe(
      128 + osConstants.signals.SIGTERM,
    );
    expect(signaledIo.stderrMessages.join("")).toContain("SIGTERM");
  });

  it("rejects L1 before invoking Wave and recommends the local builder", () => {
    const io = capturingIo();
    const runner = vi.fn<WaveRunner>();
    expect(runWaveBiopixi(l1, {}, { io, runner })).toBe(EXIT_CODES.dataError);
    expect(runner).not.toHaveBeenCalled();
    expect(io.stdoutMessages).toEqual([]);
    expect(io.stderrMessages.join("")).toContain("needs a local builder");
  });

  it("classifies malformed and unresolved evidence as a project failure", () => {
    const malformedToml = project("[workspace\nchannels = []");
    const malformedYaml = project(
      `[workspace]
channels = ["conda-forge"]
platforms = ["linux-64"]
[dependencies]
zlib = "*"
`,
      "environments: [\n",
    );
    const unresolved = project(`[workspace]
channels = ["conda-forge"]
platforms = ["linux-64"]
[dependencies]
zlib = "*"
`);

    for (const directory of [malformedToml, malformedYaml, unresolved]) {
      const io = capturingIo();
      expect(runWaveBiopixi(directory, {}, { io })).toBe(EXIT_CODES.dataError);
      expect(io.stdoutMessages).toEqual([]);
      expect(io.stderrMessages.join("")).not.toContain("internal");
    }
  });

  it("does not print credentials from project channel evidence", () => {
    const directory = project(
      `[workspace]
channels = ["https://user:secret@conda.anaconda.org/ome?token=value#private"]
platforms = ["linux-64"]
[dependencies]
custom-tool = "==1.0"
`,
      `version: 7
environments:
  default:
    channels:
      - url: https://conda.anaconda.org/ome/
    packages:
      linux-64:
        - conda: https://conda.anaconda.org/ome/linux-64/custom-tool-1.0-0.conda
`,
    );
    const io = capturingIo();
    const runner = vi.fn<WaveRunner>();

    expect(runWaveBiopixi(directory, { printCommand: true }, { io, runner })).toBe(
      EXIT_CODES.dataError,
    );
    expect(runner).not.toHaveBeenCalled();
    expect(io.stdoutMessages).toEqual([]);
    expect(io.stderrMessages.join("")).not.toContain("secret");
    expect(io.stderrMessages.join("")).not.toContain("token=value");
    expect(io.stderrMessages.join("")).toContain("configure authentication outside pixi.toml");
  });
});

describe("buildProgram", () => {
  it("documents service-contact behavior and exposes no credential flags", () => {
    const help = buildProgram().helpInformation();
    expect(help).toMatch(/still contacts the\s+Wave service/);
    expect(help).not.toContain("tower-token");
    expect(help).not.toContain("wave-endpoint");
    expect(help).not.toContain("conda-package");
    expect(help).not.toContain("conda-channels");
  });

  it("distinguishes invalid wrapper syntax from project and Wave failures", () => {
    const io = capturingIo();
    expect(runProgram(["node", "wave-biopixi", "--not-a-wrapper-option"], { io })).toBe(
      EXIT_CODES.usage,
    );
    expect(io.stderrMessages.join("")).toContain("unknown option");
  });

  it("parses and forwards the wrapper surface", () => {
    const io = capturingIo();
    const codes: number[] = [];
    const runner = vi.fn<WaveRunner>(() => ({ status: 0, signal: null, error: undefined }));
    buildProgram({ io, runner, setExitCode: (code) => codes.push(code) }).parse([
      "node",
      "wave-biopixi",
      l3,
      "--wave",
      "/opt/wave",
      "--dry-run",
      "--await",
      "10m",
      "--freeze",
      "--build-repo",
      "registry.example/project",
      "--build-template",
      "conda/pixi:v1",
      "--singularity",
      "--output",
      "yaml",
    ]);

    expect(codes).toEqual([0]);
    expect(runner.mock.calls[0]?.[0]).toBe("/opt/wave");
    expect(runner.mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining([
        "--dry-run",
        "--await",
        "10m",
        "--freeze",
        "--build-repo",
        "registry.example/project",
        "--build-template",
        "conda/pixi:v1",
        "--singularity",
        "--output",
        "yaml",
      ]),
    );
  });
});
