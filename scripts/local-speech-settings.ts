import "dotenv/config";
import { localSpeechSettings } from "../shared/local-speech.js";
console.log(
  JSON.stringify(
    localSpeechSettings(
      process.env.STT_BASE_URL || "",
      process.env.STT_MODEL || "",
    ),
  ),
);
