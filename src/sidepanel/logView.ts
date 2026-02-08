export const createLogView = (logOutput: HTMLDivElement | null) => {
  const clearLogOutput = () => {
    if (logOutput) {
      logOutput.textContent = "";
    }
  };

  const formatLogData = (data?: unknown) => {
    if (data === undefined) return "";
    try {
      const serialized = JSON.stringify(data);
      return serialized ? ` ${serialized}` : "";
    } catch {
      return ` ${String(data)}`;
    }
  };

  const appendLogLine = (line: string) => {
    if (!logOutput) return;
    logOutput.textContent = logOutput.textContent
      ? `${logOutput.textContent}\n${line}`
      : line;
    requestAnimationFrame(() => {
      logOutput.scrollTop = logOutput.scrollHeight;
    });
  };

  return {
    clearLogOutput,
    formatLogData,
    appendLogLine
  };
};
