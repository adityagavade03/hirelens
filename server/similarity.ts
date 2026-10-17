import { createHash } from "node:crypto";
import type { Express } from "express";
import { InterviewModel, SubmissionModel } from "./models.js";
import { accessibleInterview, objectId, permit } from "./security.js";
import { interviewProblem } from "./coding.js";
import type { User } from "../shared/types.js";

const keywords = new Set(
  "if else elif for while return def function class public private static void int double float boolean const let var new null None true false True False import from try catch except finally throw throws async await switch case break continue yield lambda in of and or not with as this self print console log System out range len input map filter reduce char long short signed unsigned struct enum typedef union sizeof bool auto template typename namespace using nullptr delete virtual override friend volatile register extern do default".split(
    " ",
  ),
);
export function codeTokens(code: string, language?: string) {
  // In C/C++, # introduces a directive, not a Python-style comment. Drop
  // includes/pragma boilerplate but retain executable macro definitions.
  if (language === "c" || language === "cpp")
    code = code
      .replace(/^[\t ]*#[\t ]*(?:include|pragma)\b[^\n]*/gm, "")
      .replace(/^([\t ]*)#/gm, "$1PREPROCESSOR ");
  // Match strings BEFORE comments so URLs and # inside literals survive tokenization.
  const tokens =
    code.match(
      /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|===|!==|==|!=|<=|>=|=>|\*\*|&&|\|\||[^\s]/g,
    ) || [];
  return tokens
    .filter((t) => !/^(\/\/|\/\*|#)/.test(t))
    .map((t) =>
      /^["'`]/.test(t)
        ? "STR"
        : /^\d/.test(t)
          ? "NUM"
          : /^[A-Za-z_$]/.test(t) && !keywords.has(t)
            ? "ID"
            : t,
    );
}
function shingles(tokens: string[]) {
  const result = new Set<string>();
  for (let n = 0; n <= tokens.length - 9; n++)
    result.add(
      createHash("sha256")
        .update(tokens.slice(n, n + 9).join(" "))
        .digest("hex")
        .slice(0, 24),
    );
  return result;
}
export function compareCode(
  left: string,
  right: string,
  starter = "",
  language?: string,
) {
  const aTokens = codeTokens(left, language),
    bTokens = codeTokens(right, language),
    boilerplate = shingles(codeTokens(starter, language));
  const clean = (tokens: string[]) =>
    new Set([...shingles(tokens)].filter((t) => !boilerplate.has(t)));
  const a = clean(aTokens),
    b = clean(bTokens);
  if (
    Math.min(aTokens.length, bTokens.length) < 80 ||
    Math.min(a.size, b.size) < 20
  )
    return {
      score: null,
      shared: 0,
      reason: "Too little distinctive code after excluding starter patterns.",
    };
  const shared = [...a].filter((t) => b.has(t)).length;
  return {
    score: Math.round((shared * 100) / (a.size + b.size - shared)),
    shared,
    reason:
      "Normalized 9-token pattern overlap, with starter patterns excluded.",
  };
}
export async function similarityFor(user: User, interview: any) {
  const limitation =
    "Pattern overlap is a review lead, not proof of copying. Common algorithms and short exercises can look alike. Names, literals, comments and formatting are normalized; semantics and external websites are not checked. Never used to decide hiring automatically.";
  if (interview.type === "practice")
    return {
      status: "unavailable",
      matches: [],
      compared: 0,
      limitation:
        "Private practice is excluded from cross-candidate comparison.",
    };
  const target = await SubmissionModel.findOne({
    interviewId: interview.id || interview._id.toString(),
    mode: "submit",
  }).sort({ createdAt: -1 });
  if (!target?.code)
    return {
      status: "unavailable",
      matches: [],
      compared: 0,
      limitation: "A submitted coding solution is required.",
    };
  const problem = await interviewProblem(interview);
  const peers = await InterviewModel.find({
    companyId: interview.companyId,
    problemId: interview.problemId,
    candidateId: { $ne: interview.candidateId },
    type: { $ne: "practice" },
  })
    .sort({ createdAt: -1 })
    .limit(500)
    .select("candidateId interviewerId");
  const solutions = await SubmissionModel.find({
    interviewId: { $in: peers.map((i) => i.id) },
    language: target.language,
    mode: "submit",
  })
    .sort({ createdAt: -1 })
    .limit(2000);
  const seen = new Set<string>(),
    matches = [];
  let compared = 0,
    insufficient = 0;
  for (const solution of solutions) {
    const peer = peers.find((p) => p.id === solution.interviewId);
    if (!peer || seen.has(peer.candidateId)) continue;
    seen.add(peer.candidateId);
    const comparison = compareCode(
      target.code,
      solution.code || "",
      problem.starter[target.language || ""] || "",
      target.language || undefined,
    );
    if (comparison.score == null) {
      insufficient++;
      continue;
    }
    compared++;
    if (comparison.score >= 70)
      matches.push({
        score: comparison.score,
        sharedPatterns: comparison.shared,
        interviewId:
          user.role === "company" || peer.interviewerId === user._id
            ? peer.id
            : undefined,
      });
  }
  return {
    status: compared ? "checked" : "insufficient",
    compared,
    insufficient,
    language: target.language,
    matches: matches.sort((a, b) => b.score - a.score).slice(0, 10),
    limitation,
    scope:
      "Latest same-language submission per other candidate, within this company and problem. At most 500 recent interviews / 2,000 submissions.",
    method: "token-overlap-v1",
  };
}
export function registerSimilarity(app: Express) {
  app.get(
    "/api/interviews/:id/similarity",
    permit("company", "hr"),
    async (req, res) => {
      const interview = await accessibleInterview(
        req.user,
        objectId.parse(req.params.id),
      );
      res.json(await similarityFor(req.user, interview));
    },
  );
}
