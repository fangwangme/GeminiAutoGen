export {};

declare global {
  interface FileSystemDirectoryHandle {
    queryPermission?: (descriptor: { mode: "read" | "readwrite" }) =>
      | Promise<PermissionState>
      | Promise<"granted" | "denied" | "prompt">;
    values?: () => AsyncIterable<FileSystemHandle>;
  }
}
