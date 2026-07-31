/** @module @biopixi/wave-cli */

export { planWaveBuild } from "./plan.js";
export {
  buildWaveCommand,
  redactSensitiveUrls,
  renderWaveCommand,
  waveTarget,
} from "./wave-command.js";
export type { WaveCommand, WaveCommandOptions, WaveOutput } from "./wave-command.js";
export { buildProgram, EXIT_CODES, runProgram, runWaveBiopixi } from "./program.js";
export type {
  ProgramDependencies,
  RunWaveBiopixiOptions,
  WaveCommandIo,
  WaveRunner,
  WaveRunnerOptions,
  WaveRunnerResult,
} from "./program.js";
