/** Shared language keys used by saved drafts, the editor and the execution API. */
export const codingLanguageKeys = [
  "python",
  "javascript",
  "java",
  "c",
  "cpp",
] as const;
export type CodingLanguage = (typeof codingLanguageKeys)[number];
export const codingLanguages: { key: CodingLanguage; label: string }[] = [
  { key: "python", label: "Python" },
  { key: "javascript", label: "JavaScript" },
  { key: "java", label: "Java" },
  { key: "c", label: "C" },
  { key: "cpp", label: "C++" },
];

export const blankStarters: Record<CodingLanguage, string> = {
  python: "",
  javascript: "",
  java: "",
  c: "#include <stdio.h>\n\nint main(void) {\n    // Read standard input and write your answer to standard output.\n    return 0;\n}\n",
  cpp: "#include <iostream>\n\nint main() {\n    // Read standard input and write your answer to standard output.\n    return 0;\n}\n",
};
