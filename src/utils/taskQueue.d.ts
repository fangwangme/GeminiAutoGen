export type TaskLike = {
  name: string;
  prompt: string;
};

export declare const toSafeTaskFilename: (name: string) => string;
export declare const buildPendingTaskQueue: (
  loadedTasks: TaskLike[],
  existingFiles: Set<string>
) => TaskLike[];
