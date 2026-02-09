import type { TaskItem } from "../types.js";

type Translator = (key: string, vars?: Record<string, string | number>) => string;

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

export function bindJsonFileUpload(params: {
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
    reader.onload = (e: ProgressEvent<FileReader>) => {
      try {
        const result = e.target?.result;
        const rawText = typeof result === "string" ? result : "";
        const json = JSON.parse(rawText) as unknown;
        if (!Array.isArray(json)) {
          throw new Error("File must contain an array");
        }
        const tasks = json as TaskItem[];
        setLoadedTasks(tasks);
        setFileInfo(t("sidepanel.status.loadedTasks", { count: tasks.length }));
        void storageSet({ loadedTasks: tasks });
      } catch {
        setLoadedTasks([]);
        setFileInfo(t("sidepanel.status.errorInvalidJson"), true);
      }
    };
    reader.readAsText(file);
  });
}
