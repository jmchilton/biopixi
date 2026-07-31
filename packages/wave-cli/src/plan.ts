import {
  CondaBuildPlanError,
  CREDENTIAL_CHANNEL_REASON,
  planCondaBuild,
  type CondaBuildPlan,
} from "@biopixi/core";

/**
 * Wave needs every input to be publicly reachable, so L2 is the floor.
 *
 * The refusal is rewritten here rather than in core because the way out depends on which builder
 * you wanted: core knows the project is L1, but only this package knows that Wave is the wrong
 * tool for it.
 */
export function planWaveBuild(project: string): CondaBuildPlan {
  try {
    return planCondaBuild(project, { minimumLevel: 2 });
  } catch (error) {
    if (error instanceof CondaBuildPlanError && error.kind === "insufficient-level") {
      const label = error.result?.label ?? "below L2";
      const credentialCapped = error.result?.reasons.includes(CREDENTIAL_CHANNEL_REASON) === true;
      throw new CondaBuildPlanError(
        error.kind,
        credentialCapped
          ? `Wave requires definitive L2 or higher evidence; this project is ${label}. Remove embedded channel credentials and configure authentication outside pixi.toml.`
          : `Wave requires definitive L2 or higher evidence; this project is ${label}. A local path package or local channel needs a local builder.`,
        error.result,
      );
    }
    throw error;
  }
}
