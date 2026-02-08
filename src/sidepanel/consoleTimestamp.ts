const formatLogTimestamp = () => new Date().toISOString();

export const attachConsoleTimestamps = () => {
  const levels: Array<"log" | "warn" | "error"> = ["log", "warn", "error"];
  levels.forEach((level) => {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(`[${formatLogTimestamp()}]`, ...args);
    };
  });
};
