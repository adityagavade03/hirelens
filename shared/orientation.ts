// Coarse camera-relative geometry, not gaze, attention, intent, or an identity check.
export function headTurned(points: { x: number; y: number }[]) {
  const left = points[33],
    right = points[263],
    nose = points[1];
  if (!left || !right || !nose) return false;
  const width = Math.hypot(left.x - right.x, left.y - right.y);
  if (!Number.isFinite(width) || width < 0.025) return false;
  return Math.abs(nose.x - (left.x + right.x) / 2) / width > 0.38;
}
