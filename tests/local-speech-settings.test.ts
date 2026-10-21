import { expect, it } from "vitest";
import { localSpeechSettings } from "../shared/local-speech";
it("starts the adapter matching the configured model and port", () => {
  expect(localSpeechSettings("http://127.0.0.1:8767/v1", "small")).toEqual({
    local: true,
    port: 8767,
    model: "small",
    language: "auto",
  });
  expect(localSpeechSettings("", "")).toMatchObject({
    local: true,
    port: 8765,
    model: "base.en",
  });
  expect(
    localSpeechSettings("https://speech.example.test/v1", "hosted-model"),
  ).toEqual({ local: false });
});
it("does not launch with malformed local URLs or silently replace an unsupported model", () => {
  for (const url of [
    "http://localhost:80/v1",
    "http://user:password@localhost:8767/v1",
    "http://localhost:8767/v1?token=private",
    "http://localhost:8767/other",
  ])
    expect(() => localSpeechSettings(url, "small")).toThrow();
  expect(() =>
    localSpeechSettings("http://localhost:8767/v1", "custom"),
  ).toThrow();
});
