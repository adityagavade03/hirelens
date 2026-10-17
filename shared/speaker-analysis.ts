import { z } from "zod";
export const speakerResultSchema = z
  .object({
    model: z.string().trim().min(1).max(160),
    duration: z.number().finite().positive().max(121),
    segments: z
      .array(
        z
          .object({
            start: z.number().finite().min(0),
            end: z.number().finite().positive().max(121),
            speaker: z.string().regex(/^speaker_[0-9]{1,3}$/),
          })
          .strict(),
      )
      .max(2000),
  })
  .strict()
  .superRefine((value, context) => {
    for (const s of value.segments)
      if (s.end <= s.start || s.end > value.duration + 0.1)
        context.addIssue({
          code: "custom",
          message: "Invalid diarization segment bounds",
        });
  });
export function summarizeSpeakers(value: unknown) {
  const result = speakerResultSchema.parse(value);
  const bySpeaker = new Map<string, { start: number; end: number }[]>();
  for (const segment of result.segments) {
    const spans = bySpeaker.get(segment.speaker) || [];
    spans.push(segment);
    bySpeaker.set(segment.speaker, spans);
  }
  // Merge overlaps so repeated provider spans cannot inflate support for a cluster.
  const clusters = [...bySpeaker.entries()]
    .map(([speaker, spans]) => {
      let total = 0,
        end = -1;
      for (const span of spans.sort((a, b) => a.start - b.start)) {
        total += Math.max(0, span.end - Math.max(end, span.start));
        end = Math.max(end, span.end);
      }
      return { speaker, seconds: Math.round(total * 100) / 100 };
    })
    .sort((a, b) => b.seconds - a.seconds);
  const sustained = clusters.filter((c) => c.seconds >= 2);
  return {
    ...result,
    clusters,
    estimatedSpeakers: sustained.length,
    additionalSpeakerEstimate: sustained.length >= 2,
    message:
      sustained.length >= 2
        ? "At least two sustained speaker clusters were estimated. Listen to the clip and discuss the context; playback, the interviewer, background audio or model error can explain this."
        : "No second sustained speaker cluster was estimated in this clip. This does not establish that only one person was present.",
    limitations:
      "Estimated speaker clusters, not identities or proof of assistance. Labels are local to each clip and must not be matched across clips. Two seconds of support is a display filter, not a calibrated probability. Never used in integrity points, technical scores or hiring decisions.",
  };
}
export type SpeakerResult = ReturnType<typeof summarizeSpeakers>;
