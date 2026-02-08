export const isWatchdogTimeoutError = (message) =>
  /watchdog timeout/i.test(message || "");

export const computeTaskWatchdogTimeoutMs = (taskMode, settings = {}) => {
  const toSeconds = (value, fallback) =>
    typeof value === "number" && value > 0 ? value : fallback;

  const generationMs =
    toSeconds(settings.settings_generationTimeout, 120) * 1000;
  const downloadMs = toSeconds(settings.settings_downloadTimeout, 120) * 1000;
  const safetyMs = 15000;

  return taskMode === "download-only"
    ? downloadMs + safetyMs
    : generationMs + safetyMs;
};
