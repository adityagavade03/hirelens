export interface IntegrityEvent {
  kind?: string | null;
  occurredAt?: Date | string | null;
  durationMs?: number | null;
}
/** Transparent review rules, not a trained cheating classifier or probability. */
export function analyzeIntegrity(events: IntegrityEvent[], consented = true) {
  const counts: Record<string, number> = {};
  const seen = new Map<string, number>();
  for (const event of [...events].sort(
    (a, b) => +new Date(a.occurredAt || 0) - +new Date(b.occurredAt || 0),
  )) {
    if (!event.kind) continue;
    const at = +new Date(event.occurredAt || 0);
    if (seen.has(event.kind) && at - seen.get(event.kind)! < 5000) continue;
    seen.set(event.kind, at);
    counts[event.kind] = (counts[event.kind] || 0) + 1;
  }
  const reasons: {
    signal: string;
    count: number;
    points: number;
    explanation: string;
  }[] = [];
  const add = (
    signal: string,
    count: number,
    points: number,
    explanation: string,
  ) => {
    if (count) reasons.push({ signal, count, points, explanation });
  };
  // Hidden and blur commonly describe the same action, so use their maximum, not their sum.
  const away = Math.max(counts.hidden || 0, counts.blur || 0);
  add(
    "Window / tab changes",
    away,
    away < 3 ? 0 : Math.min(30, (away - 2) * 5),
    "Repeated focus changes need context; accessibility tools and connection problems can cause these events.",
  );
  add(
    "Paste actions",
    counts.paste || 0,
    (counts.paste || 0) >= 3 ? 15 : 0,
    "Paste events do not reveal the origin or meaning of pasted content.",
  );
  add(
    "Fullscreen exits",
    counts["fullscreen-exit"] || 0,
    (counts["fullscreen-exit"] || 0) >= 3 ? 10 : 0,
    "Fullscreen exits alone do not establish misconduct.",
  );
  add(
    "Face absent",
    counts["no-face"] || 0,
    (counts["no-face"] || 0) >= 2 ? 10 : 0,
    "Lighting, camera angle, accessibility needs, or a break can explain this signal.",
  );
  add(
    "Multiple faces",
    counts["multiple-faces"] || 0,
    (counts["multiple-faces"] || 0) >= 2 ? 20 : 0,
    "A detector can be wrong. Review the circumstances with the candidate.",
  );
  const score = Math.min(
    100,
    reasons.reduce((n, r) => n + r.points, 0),
  );
  const categories = reasons.filter((r) => r.points > 0).length;
  return {
    version: "review-rules-v1",
    score: consented ? score : null,
    level: !consented
      ? "unavailable"
      : categories >= 3 && score >= 60
        ? "high"
        : categories >= 2 && score >= 30
          ? "medium"
          : "low",
    reasons,
    counts,
    coverage: {
      events: events.length,
      monitoringUnavailable: !!counts["monitoring-unavailable"],
      connectionInterruptions: counts["connection-interrupted"] || 0,
    },
    limitations:
      "Review priority only, not proof of cheating. Browser events are self-reported and incomplete; low risk does not prove integrity. Audio and gaze are not used. These signals never determine the hiring decision or technical score.",
  };
}
