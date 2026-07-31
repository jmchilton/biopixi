import { CondaBuildPlanError, planCondaBuild, type CondaBuildPlan } from "@biopixi/core";

/** Build evidence accepted by the hosted Wave adapter. */
export function planWaveBuild(project: string): CondaBuildPlan {
  try {
    return planCondaBuild(project, { minimumLevel: 2 });
  } catch (error) {
    if (error instanceof CondaBuildPlanError && error.kind === "insufficient-level") {
      const credentialEvidence = error.result?.reasons.some((reason) =>
        reason.includes("embedded credentials"),
      );
      throw new CondaBuildPlanError(
        error.kind,
        credentialEvidence === true
          ? `Wave requires definitive L2 or higher evidence; this project is ${error.result?.label ?? "below L2"}. Remove embedded channel credentials and configure authentication outside pixi.toml.`
          : `Wave requires definitive L2 or higher evidence; this project is ${error.result?.label ?? "below L2"}. Use mulled-biopixi for local path packages and local channels.`,
        error.result,
      );
    }
    throw error;
  }
}
