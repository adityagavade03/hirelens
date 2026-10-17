/** Friendly recovery advice; never expose raw device/ICE error objects in the room. */
export function mediaError(error: unknown, screen = false) {
  const name = (error as { name?: string })?.name;
  if (name === "TimeoutError")
    return screen
      ? "The browser did not finish screen selection. Dismiss its old prompt, then select Share screen to try again."
      : "The browser did not finish the camera or microphone request. Check its permission prompt or site settings, then select Check selected devices again.";
  if (name === "NotAllowedError" || name === "SecurityError")
    return screen
      ? "Screen sharing was cancelled or blocked. Select Share screen to try again."
      : "Camera or microphone access was blocked. Allow access in your browser's site settings, then check devices again.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError")
    return "No camera or microphone was found. Connect a device, then check again. You can still use typed answers.";
  if (name === "NotReadableError" || name === "TrackStartError")
    return "Your camera or microphone is busy or unavailable. Close other apps using it, reconnect the device, then retry.";
  if (name === "OverconstrainedError")
    return "The selected device cannot use these settings. Choose another device or try again.";
  if (name === "AbortError")
    return "The device check was interrupted. Please try again.";
  return screen
    ? "Screen sharing could not start. Use a supported desktop browser over HTTPS or localhost, then retry."
    : "Media could not start. Use a supported browser over HTTPS or localhost and check your device permissions.";
}
