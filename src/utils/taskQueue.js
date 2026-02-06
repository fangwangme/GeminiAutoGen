export const toSafeTaskFilename = (name) => {
  let safeName = (name || "").replace(/[^a-z0-9_\-.]/gi, "_");
  if (
    !safeName.toLowerCase().endsWith(".png") &&
    !safeName.toLowerCase().endsWith(".jpg")
  ) {
    safeName += ".png";
  }
  return safeName;
};

export const buildPendingTaskQueue = (loadedTasks, existingFiles) =>
  (loadedTasks || []).filter((item) => {
    if (!item || !item.name) return false;
    const safeName = toSafeTaskFilename(item.name);
    return !existingFiles.has(safeName);
  });
