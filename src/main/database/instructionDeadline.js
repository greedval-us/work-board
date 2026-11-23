export const EFFECTIVE_INSTRUCTION_DEADLINE_SQL = "COALESCE(NULLIF(extended_until, ''), deadline)";

export function instructionDeadlineRange(from, to) {
  return [
    [from, `${EFFECTIVE_INSTRUCTION_DEADLINE_SQL} >= ?`],
    [to, `${EFFECTIVE_INSTRUCTION_DEADLINE_SQL} <= ?`],
  ];
}
