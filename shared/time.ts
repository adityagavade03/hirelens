// Convert a chosen wall-clock time in an IANA timezone to one UTC instant.
export function wallTime(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (key: string) => parts.find((p) => p.type === key)!.value;
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}
export function zonedTimeToUtc(value: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Choose a valid date and time.");
  const desired = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(desired))
    throw new Error("Choose a valid date and time.");
  let instant = desired;
  for (let i = 0; i < 4; i++) {
    const represented = Date.parse(
      `${wallTime(new Date(instant), timeZone)}:00Z`,
    );
    instant += desired - represented;
  }
  if (wallTime(new Date(instant), timeZone) !== value)
    throw new Error(
      "This local time does not exist because the timezone changes its clocks. Choose another time.",
    );
  // Reject repeated wall times instead of silently choosing a DST occurrence.
  for (const delta of [-3600000, -1800000, 1800000, 3600000]) {
    if (wallTime(new Date(instant + delta), timeZone) === value)
      throw new Error(
        "This local time occurs twice because the clocks change. Choose an unambiguous time.",
      );
  }
  return new Date(instant).toISOString();
}
