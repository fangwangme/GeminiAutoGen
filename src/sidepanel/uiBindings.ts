import type { TaskItem } from "../types.js";

type Translator = (key: string, vars?: Record<string, string | number>) => string;

// Process tasks: convert image file paths to data URLs if user has granted directory access
let imageDirectoryHandle: FileSystemDirectoryHandle | null = null;

export async function processTasksWithImages(tasks: TaskItem[]): Promise<TaskItem[]> {
  // If no tasks have images, return as-is
  const tasksWithImages = tasks.filter(t => t.images && t.images.length > 0);
  if (tasksWithImages.length === 0) {
    return tasks;
  }
  
  // If we don't have directory access yet, prompt user
  if (!imageDirectoryHandle) {
    try {
      imageDirectoryHandle = await window.showDirectoryPicker();
    } catch (err) {
      console.warn("[Panel] No directory access for images:", err);
      // Return tasks with original paths - content script will warn about unsupported format
      return tasks;
    }
  }
  
  // Verify we still have permission
  if (imageDirectoryHandle) {
    try {
      // @ts-expect-error - queryPermission is not in standard types
      const permission = await imageDirectoryHandle.queryPermission({ mode: 'read' });
      if (permission !== 'granted') {
        // @ts-expect-error - requestPermission is not in standard types
        const requestResult = await imageDirectoryHandle.requestPermission({ mode: 'read' });
        if (requestResult !== 'granted') {
          console.warn("[Panel] Directory permission denied");
          return tasks;
        }
      }
    } catch {
      // Permission request failed
      return tasks;
    }
  }
  
  // Process each task with images
  const processedTasks: TaskItem[] = [];
  for (const task of tasks) {
    if (!task.images || task.images.length === 0) {
      processedTasks.push(task);
      continue;
    }
    
    const imageUrls: string[] = [];
    for (const imagePath of task.images) {
      try {
        // Handle data URLs directly
        if (imagePath.startsWith('data:')) {
          imageUrls.push(imagePath);
          continue;
        }
        
        // Handle file paths - read from selected directory
        const fileName = imagePath.split(/[/\\]/).pop() || imagePath;
        const fileHandle = await imageDirectoryHandle!.getFileHandle(fileName);
        const file = await fileHandle.getFile();
        
        // Convert to data URL
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => resolve('');
          reader.readAsDataURL(file);
        });
        
        if (dataUrl) {
          imageUrls.push(dataUrl);
        } else {
          console.warn(`[Panel] Failed to read image: ${fileName}`);
        }
      } catch (err) {
        console.error(`[Panel] Failed to process image ${imagePath}:`, err);
      }
    }
    
    processedTasks.push({
      ...task,
      images: imageUrls
    });
  }
  
  return processedTasks;
}

export function bindSettingsButton(
  settingsBtn: HTMLButtonElement | null,
  runtimeSendMessage: <T>(message: unknown) => Promise<T>
) {
  if (!settingsBtn) {
    console.warn("[Panel] Settings button not found");
    return;
  }
  settingsBtn.addEventListener("click", async () => {
    try {
      await chrome.runtime.openOptionsPage();
    } catch {
      await runtimeSendMessage<void>({ action: "OPEN_OPTIONS" });
    }
  });
}

export function bindCurrentFileCopy(params: {
  currentFileNameEl: HTMLDivElement | null;
  copiedLabel: () => string;
}) {
  const { currentFileNameEl, copiedLabel } = params;
  if (!currentFileNameEl) return;
  currentFileNameEl.addEventListener("click", async () => {
    const text = currentFileNameEl.textContent || "";
    const filename = text.replace(/^[^\w]*/, "").trim();
    const nameWithoutExt = filename.replace(/\.[^.]+$/, "");
    if (!nameWithoutExt) return;
    try {
      await navigator.clipboard.writeText(nameWithoutExt);
      const original = currentFileNameEl.textContent;
      currentFileNameEl.textContent = copiedLabel();
      setTimeout(() => {
        currentFileNameEl.textContent = original;
      }, 800);
    } catch (err) {
      console.error("[Panel] Failed to copy:", err);
    }
  });
}

export function bindLogControls(params: {
  logCopyBtn: HTMLButtonElement | null;
  logClearBtn: HTMLButtonElement | null;
  logToggleBtn: HTMLButtonElement | null;
  logOutput: HTMLDivElement | null;
  clearLogOutput: () => void;
  applyLogCollapsed: (collapsed: boolean) => void;
  getLogCollapsed: () => boolean;
  setLogCollapsed: (collapsed: boolean) => void;
  storageSet: (items: Record<string, unknown>) => Promise<void>;
  logCollapsedStorageKey: string;
  copiedLabel: () => string;
}) {
  const {
    logCopyBtn,
    logClearBtn,
    logToggleBtn,
    logOutput,
    clearLogOutput,
    applyLogCollapsed,
    getLogCollapsed,
    setLogCollapsed,
    storageSet,
    logCollapsedStorageKey,
    copiedLabel
  } = params;

  if (logCopyBtn) {
    logCopyBtn.addEventListener("click", async () => {
      if (!logOutput) return;
      const text = logOutput.textContent || "";
      if (!text.trim()) return;
      try {
        await navigator.clipboard.writeText(text);
        const originalText = logCopyBtn.textContent;
        logCopyBtn.textContent = copiedLabel();
        setTimeout(() => {
          logCopyBtn.textContent = originalText;
        }, 800);
      } catch (err) {
        console.error("[Panel] Failed to copy logs:", err);
      }
    });
  }

  if (logClearBtn) {
    logClearBtn.addEventListener("click", () => {
      clearLogOutput();
    });
  }

  if (logToggleBtn) {
    logToggleBtn.addEventListener("click", async () => {
      const nextCollapsed = !getLogCollapsed();
      setLogCollapsed(nextCollapsed);
      applyLogCollapsed(nextCollapsed);
      await storageSet({ [logCollapsedStorageKey]: nextCollapsed });
    });
  }
}

export async function bindJsonFileUpload(params: {
  jsonFileInput: HTMLInputElement;
  setLoadedTasks: (tasks: TaskItem[]) => void;
  setFileInfo: (text: string, isError?: boolean) => void;
  t: Translator;
  storageSet: (items: Record<string, unknown>) => Promise<void>;
}) {
  const { jsonFileInput, setLoadedTasks, setFileInfo, t, storageSet } = params;

  jsonFileInput.addEventListener("change", (event: Event) => {
    const target = event.target as HTMLInputElement | null;
    const file = target?.files?.[0];
    if (!file) {
      setLoadedTasks([]);
      setFileInfo(t("sidepanel.file.noFile"));
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e: ProgressEvent<FileReader>) => {
      try {
        const result = e.target?.result;
        const rawText = typeof result === "string" ? result : "";
        const json = JSON.parse(rawText) as unknown;
        if (!Array.isArray(json)) {
          throw new Error("File must contain an array");
        }
        const tasks = json as TaskItem[];
        
        // Process tasks with images - convert file paths to data URLs
        const processedTasks = await processTasksWithImages(tasks);
        
        setLoadedTasks(processedTasks);
        setFileInfo(t("sidepanel.status.loadedTasks", { count: processedTasks.length }));
        void storageSet({ loadedTasks: processedTasks });
      } catch {
        setLoadedTasks([]);
        setFileInfo(t("sidepanel.status.errorInvalidJson"), true);
      }
    };
    reader.readAsText(file);
  });
}
