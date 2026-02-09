const FOLDER_ERROR_FRAGMENTS = [
  "missing directory handles",
  "permission lost",
  "directory iteration is not supported",
  "notallowederror",
  "securityerror",
  "permission",
  "not authorized",
  "denied"
];

const DOWNLOAD_ERROR_FRAGMENTS = [
  "rename",
  "waiting for file",
  "timeout waiting for download"
];

const toNormalized = (message) => (message || "").toLowerCase();

export const isFolderAuthErrorMessage = (message) => {
  const normalized = toNormalized(message);
  return FOLDER_ERROR_FRAGMENTS.some((fragment) =>
    normalized.includes(fragment)
  );
};

export const isDownloadErrorMessage = (message) => {
  const normalized = toNormalized(message);
  return DOWNLOAD_ERROR_FRAGMENTS.some((fragment) =>
    normalized.includes(fragment)
  );
};

export const resolveTaskErrorType = (error, explicitType) => {
  if (explicitType) return explicitType;
  if (isFolderAuthErrorMessage(error)) return "folder";
  if (isDownloadErrorMessage(error)) return "download";
  return "generation";
};
