import type { TaskItem } from "../types.js";
import { validateLockedConversationUrl } from "../utils/lockedConversation.js";
import type { TaskLifecycleState } from "./taskLifecycle.js";

type Translator = (key: string, vars?: Record<string, string | number>) => string;

export async function restoreInitialState(params: {
  runState: TaskLifecycleState;
  t: Translator;
  conversationUrlInput: HTMLInputElement;
  urlStatus: HTMLDivElement;
  fileInfo: HTMLDivElement;
  setLoadedTasks: (tasks: TaskItem[]) => void;
  storageGet: <T>(keys: string[]) => Promise<T>;
}) {
  const {
    runState,
    t,
    conversationUrlInput,
    urlStatus,
    fileInfo,
    setLoadedTasks,
    storageGet
  } = params;

  const urlData = await storageGet<{ lockedConversationUrl?: string }>([
    "lockedConversationUrl"
  ]);
  if (urlData.lockedConversationUrl) {
    const candidate = urlData.lockedConversationUrl.trim();
    const validation = validateLockedConversationUrl(candidate, t);
    conversationUrlInput.value = candidate;
    if (validation.ok) {
      runState.lockedConversationUrl = candidate;
      urlStatus.textContent = t("sidepanel.status.urlLocked");
      urlStatus.style.color = "var(--success)";
    } else {
      runState.lockedConversationUrl = "";
      urlStatus.textContent = t("sidepanel.status.validationError", {
        reason: validation.message
      });
      urlStatus.style.color = "var(--danger)";
    }
  }

  const data = await storageGet<{ loadedTasks?: TaskItem[] }>(["loadedTasks"]);
  if (data.loadedTasks) {
    setLoadedTasks(data.loadedTasks);
    fileInfo.textContent = t("sidepanel.status.loadedTasks", {
      count: data.loadedTasks.length
    });
    fileInfo.style.color = "var(--success)";
  }
}
