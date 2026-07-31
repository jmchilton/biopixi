import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { constants as osConstants } from "node:os";

import { CondaBuildPlanError } from "@biopixi/core";
import { Command, CommanderError, Option } from "commander";

import packageMetadata from "../package.json" with { type: "json" };
import { planWaveBuild } from "./plan.js";
import {
  buildWaveCommand,
  redactSensitiveUrls,
  renderWaveCommand,
  type WaveCommandOptions,
  type WaveOutput,
} from "./wave-command.js";

export const EXIT_CODES = {
  ok: 0,
  project: 65,
  waveUnavailable: 69,
  internal: 70,
  usage: 64,
} as const;

export interface WaveRunnerOptions {
  stdio: "inherit";
  env: NodeJS.ProcessEnv;
}

export type WaveRunnerResult = Pick<SpawnSyncReturns<Buffer>, "status" | "signal" | "error">;

export type WaveRunner = (
  executable: string,
  args: string[],
  options: WaveRunnerOptions,
) => WaveRunnerResult;

export interface WaveCommandIo {
  stdout(message: string): void;
  stderr(message: string): void;
}

export interface RunWaveBiopixiOptions extends WaveCommandOptions {
  printCommand?: boolean;
}

export interface ProgramDependencies {
  runner?: WaveRunner;
  io?: WaveCommandIo;
  env?: NodeJS.ProcessEnv;
  setExitCode?: (code: number) => void;
}

const defaultIo: WaveCommandIo = {
  stdout: (message) => process.stdout.write(message),
  stderr: (message) => process.stderr.write(message),
};

const defaultRunner: WaveRunner = (executable, args, options) =>
  spawnSync(executable, args, options);

function signalExitCode(signal: NodeJS.Signals | null): number {
  if (signal === null) {
    return EXIT_CODES.internal;
  }
  const number = osConstants.signals[signal];
  return number === undefined ? EXIT_CODES.internal : 128 + number;
}

/** Plan and execute one Wave request, preserving Wave's standard streams and child exit status. */
export function runWaveBiopixi(
  project: string,
  options: RunWaveBiopixiOptions = {},
  dependencies: ProgramDependencies = {},
): number {
  const io = dependencies.io ?? defaultIo;
  let command;
  try {
    command = buildWaveCommand(planWaveBuild(project), options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`wave-biopixi: ${redactSensitiveUrls(message)}\n`);
    return error instanceof CondaBuildPlanError ? EXIT_CODES.project : EXIT_CODES.internal;
  }

  if (options.printCommand === true) {
    io.stdout(`${renderWaveCommand(command)}\n`);
    return EXIT_CODES.ok;
  }

  const result = (dependencies.runner ?? defaultRunner)(command.executable, command.args, {
    stdio: "inherit",
    env: dependencies.env ?? process.env,
  });
  if (result.error !== undefined) {
    const missing = (result.error as NodeJS.ErrnoException).code === "ENOENT";
    io.stderr(
      missing
        ? `wave-biopixi: Wave executable not found: ${command.executable}\n`
        : `wave-biopixi: could not start Wave: ${redactSensitiveUrls(result.error.message)}\n`,
    );
    return missing ? EXIT_CODES.waveUnavailable : EXIT_CODES.internal;
  }
  if (result.status !== null) {
    return result.status;
  }
  io.stderr(`wave-biopixi: Wave terminated by signal ${result.signal ?? "unknown"}\n`);
  return signalExitCode(result.signal);
}

/** Construct the wave-biopixi command without parsing process arguments. */
export function buildProgram(dependencies: ProgramDependencies = {}): Command {
  const program = new Command()
    .name("wave-biopixi")
    .description("Build a Wave container from a Biopixi-compatible Pixi project")
    .version(packageMetadata.version)
    .argument("[project]", "project directory or pixi.toml", ".")
    .option("--wave <executable>", "Wave executable", "wave")
    .option("--print-command", "print the derived Wave command without contacting Wave")
    .option("--dry-run", "ask Wave for a dry run (this still contacts the Wave service)")
    .option("--await [duration]", "wait for the Wave build, optionally for a duration")
    .option("--freeze", "forward Wave freeze mode")
    .option("--build-repo <repository>", "target repository for a frozen or Singularity image")
    .option("--build-template <template>", "Wave build template, for example conda/pixi:v1")
    .option("--singularity", "request a Singularity image")
    .addOption(new Option("--output <format>", "Wave output format").choices(["json", "yaml"]))
    .action(
      (
        project: string,
        options: {
          wave: string;
          printCommand?: boolean;
          dryRun?: boolean;
          await?: boolean | string;
          freeze?: boolean;
          buildRepo?: string;
          buildTemplate?: string;
          singularity?: boolean;
          output?: WaveOutput;
        },
      ) => {
        const code = runWaveBiopixi(
          project,
          {
            executable: options.wave,
            printCommand: options.printCommand,
            dryRun: options.dryRun,
            await: options.await,
            freeze: options.freeze,
            buildRepo: options.buildRepo,
            buildTemplate: options.buildTemplate,
            singularity: options.singularity,
            output: options.output,
          },
          dependencies,
        );
        (dependencies.setExitCode ?? ((value) => (process.exitCode = value)))(code);
      },
    );

  return program;
}

/** Parse one wrapper invocation and map Commander usage failures to a stable exit code. */
export function runProgram(
  argv: readonly string[] = process.argv,
  dependencies: ProgramDependencies = {},
): number {
  let exitCode: number = EXIT_CODES.ok;
  const io = dependencies.io ?? defaultIo;
  const program = buildProgram({
    ...dependencies,
    setExitCode: (code) => {
      exitCode = code;
    },
  })
    .configureOutput({
      writeOut: (message) => io.stdout(message),
      writeErr: (message) => io.stderr(message),
    })
    .exitOverride();

  try {
    program.parse([...argv]);
  } catch (error) {
    if (
      error instanceof CommanderError &&
      (error.code === "commander.helpDisplayed" || error.code === "commander.version")
    ) {
      return EXIT_CODES.ok;
    }
    if (error instanceof CommanderError) {
      return EXIT_CODES.usage;
    }
    throw error;
  }
  return exitCode;
}
