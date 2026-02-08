type Translator = (key: string, vars?: Record<string, string | number>) => string;

export const updateRemainingTimeLabel = (params: {
  t: Translator;
  startTime: number;
  completedTasks: number;
  totalTasks: number;
  formatTime: (seconds: number) => string;
  setLabel: (label: string) => void;
}) => {
  const { t, startTime, completedTasks, totalTasks, formatTime, setLabel } = params;
  const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);

  if (completedTasks > 0 && totalTasks > completedTasks) {
    const avgSecondsPerTask = elapsedSeconds / completedTasks;
    const remainingTasks = totalTasks - completedTasks;
    const remainingSeconds = Math.floor(avgSecondsPerTask * remainingTasks);
    const avgSeconds = Math.round(avgSecondsPerTask);
    setLabel(
      t("time.remainingWithAvg", {
        remaining: formatTime(remainingSeconds),
        avg: avgSeconds
      })
    );
    return;
  }

  if (totalTasks === completedTasks && totalTasks > 0) {
    const avgSeconds = Math.round(elapsedSeconds / totalTasks);
    setLabel(
      t("time.remainingWithAvg", {
        remaining: formatTime(0),
        avg: avgSeconds
      })
    );
    return;
  }

  setLabel(t("time.unknown"));
};
