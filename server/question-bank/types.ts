import type { Problem } from "../../shared/types.js";

/** Reference solvers and hidden cases stay on the server; never serialize this object. */
export interface PracticeDefinition {
  id: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  topic: string;
  description: string;
  constraints: string;
  examples: { input: string; output: string }[];
  tests: { input: string; output: string; hidden: boolean }[];
  solve: (input: string) => string;
}

export function publicPracticeProblem(
  definition: PracticeDefinition,
  starter: Problem["starter"],
): Problem {
  return {
    id: definition.id,
    title: definition.title,
    difficulty: definition.difficulty,
    topic: definition.topic,
    description: definition.description,
    constraints: definition.constraints,
    examples: definition.examples,
    starter,
  };
}
