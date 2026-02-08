type Translator = (key: string, vars?: Record<string, string | number>) => string;

export const appendRunSummary = (params: {
  appendLogLine: (line: string) => void;
  t: Translator;
  elapsedMs: number;
  totalTasks: number;
  skippedCount: number;
  failedCount: number;
  formatDuration: (ms: number) => string;
}) => {
  const {
    appendLogLine,
    t,
    elapsedMs,
    totalTasks,
    skippedCount,
    failedCount,
    formatDuration
  } = params;
  const completedCount = Math.max(totalTasks - skippedCount - failedCount, 0);
  const averageMs = totalTasks > 0 ? Math.round(elapsedMs / totalTasks) : 0;

  appendLogLine(t("sidepanel.log.summaryTitle"));
  appendLogLine(t("sidepanel.log.summary.total", { count: totalTasks }));
  appendLogLine(t("sidepanel.log.summary.completed", { count: completedCount }));
  appendLogLine(t("sidepanel.log.summary.skipped", { count: skippedCount }));
  appendLogLine(t("sidepanel.log.summary.failed", { count: failedCount }));
  appendLogLine(
    t("sidepanel.log.summary.totalTime", {
      time: formatDuration(elapsedMs)
    })
  );
  appendLogLine(
    t("sidepanel.log.summary.avgPerTask", {
      time: formatDuration(averageMs)
    })
  );
};
