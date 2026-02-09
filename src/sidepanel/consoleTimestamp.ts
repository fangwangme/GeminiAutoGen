const formatLogTimestamp = () => {
  const now = new Date();
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());
  const millis = pad(now.getMilliseconds(), 3);
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const offsetAbs = Math.abs(offsetMinutes);
  const offsetHours = pad(Math.floor(offsetAbs / 60));
  const offsetMins = pad(offsetAbs % 60);
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${millis} GMT${sign}${offsetHours}:${offsetMins}`;
};

export const attachConsoleTimestamps = () => {
  const levels: Array<"log" | "warn" | "error"> = ["log", "warn", "error"];
  levels.forEach((level) => {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(`[${formatLogTimestamp()}]`, ...args);
    };
  });
};
