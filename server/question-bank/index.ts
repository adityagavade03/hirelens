import { easyProblems } from "./easy.js";
import { mediumProblems } from "./medium.js";
import { hardProblems } from "./hard.js";

// Imported only by the server. Reference solutions must never be returned by APIs.
export const practiceDefinitions = [
  ...easyProblems,
  ...mediumProblems,
  ...hardProblems,
];
