// Form and filter caps are presentation constraints; preserve their independent limits.
export const INSTRUCTION_FORM_LIMITS = Object.freeze({
  incomingNumber: 200, instructionNumber: 200, title: 500, summary: 20_000, executor: 300, executionMark: 10_000,
});
export const REGISTRY_FILTER_LIMITS = Object.freeze({ instructionNumber: 200, executor: 200, executionMark: 500 });
