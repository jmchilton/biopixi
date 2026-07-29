import { Command, Option } from "commander";

import { runGrade } from "./grade-command.js";

/**
 * Construct the biopixi command tree without parsing process arguments.
 */
export function buildProgram(): Command {
  const program = new Command()
    .name("biopixi")
    .description("Grade how far a Pixi environment can travel outside its project")
    .version("0.1.0");

  program
    .command("grade")
    .description("grade one or more Pixi project directories")
    .argument("[directories...]", "project directories", ["."])
    .addOption(
      new Option("--min-level <level>", "exit nonzero below this level")
        .argParser((value) => Number.parseInt(value, 10))
        .choices(["0", "1", "2", "3", "4"]),
    )
    .action((directories: string[], options: { minLevel?: string }) => {
      const minLevel =
        options.minLevel === undefined ? undefined : Number.parseInt(options.minLevel, 10);
      process.exitCode = runGrade(directories, { minLevel });
    });

  return program;
}
