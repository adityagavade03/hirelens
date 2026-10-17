import { readFile, writeFile } from "node:fs/promises";
import { config } from "../server/config.js";
import {
  generateQuestions,
  assessAnswer,
  transcribeAudio,
} from "../server/providers.js";

const configure = process.argv.includes("--configure");
if (
  configure &&
  ((config.llmUrl && !config.llmUrl.startsWith("http://127.0.0.1:11434/")) ||
    (config.sttUrl && !config.sttUrl.startsWith("http://127.0.0.1:8765/")))
)
  throw new Error(
    "Existing provider configuration was preserved. Run without --configure to check the local services.",
  );
const speechKey = (await readFile(".data/speech/token", "utf8")).trim();
Object.assign(config, {
  llmUrl: "http://127.0.0.1:11434/v1",
  llmKey: "local-development-placeholder",
  llmModel: "qwen2.5:3b",
  llmTimeout: 120000,
  llmSchema: true,
  sttUrl: "http://127.0.0.1:8765/v1",
  sttKey: speechKey,
  sttModel: "base.en",
});
const speech = await transcribeAudio(
  await readFile(".data/speech/check.wav"),
  "audio/wav",
);
if (!/interview/i.test(speech) || !/hash/i.test(speech))
  throw new Error(
    "Speech check did not recognize the synthetic sample. Configuration was not changed.",
  );
console.log(
  "Passed: local Whisper transcribed a synthetic interview audio sample.",
);
const questions = await generateQuestions({
  jobTitle: "Java backend developer",
  topics: ["Hash maps"],
  difficulty: "Intermediate",
  interviewType: "technical",
  instruction: "Ask one concise question.",
});
if (!questions.length) throw new Error("No AI questions returned.");
console.log(
  `Passed: local Qwen generated ${questions.length} schema-validated interview question(s).`,
);
const feedback = await assessAnswer({
  question: "What is the time complexity of a hash-map lookup?",
  rubric: ["Average constant time", "Collisions affect worst case"],
  answer:
    "A hash map usually looks up a key in constant time. Many collisions can make it slower.",
});
if (!feedback.feedback) throw new Error("No AI feedback returned.");
console.log("Passed: local Qwen returned schema-validated answer feedback.");
if (configure) {
  let env = await readFile(".env", "utf8");
  for (const [key, value] of Object.entries({
    LLM_BASE_URL: config.llmUrl,
    LLM_API_KEY: config.llmKey,
    LLM_MODEL: config.llmModel,
    LLM_TIMEOUT_MS: "120000",
    LLM_JSON_SCHEMA: "true",
    STT_BASE_URL: config.sttUrl,
    STT_API_KEY: config.sttKey,
    STT_MODEL: config.sttModel,
    FACE_LANDMARK_MODEL_URL: "/vendor/mediapipe/face_landmarker.task",
  })) {
    const pattern = new RegExp(`^${key}=.*$`, "m");
    env = pattern.test(env)
      ? env.replace(pattern, `${key}=${value}`)
      : `${env}\n${key}=${value}`;
  }
  await writeFile(".env", env, { mode: 0o600 });
  console.log(
    "Local AI and speech checks passed; .env connected. Restart the API to use them.",
  );
}
