import { validateLockedConversationUrl } from "../utils/lockedConversation.js";
import type { TaskLifecycleState } from "./taskLifecycle.js";

type Translator = (key: string, vars?: Record<string, string | number>) => string;

export function bindUrlLockControls(params: {
  lockUrlBtn: HTMLButtonElement | null;
  clearUrlBtn: HTMLButtonElement | null;
  conversationUrlInput: HTMLInputElement;
  urlStatus: HTMLDivElement;
  runState: TaskLifecycleState;
  t: Translator;
  storageSet: (items: Record<string, unknown>) => Promise<void>;
  storageRemove: (keys: string | string[]) => Promise<void>;
}) {
  const {
    lockUrlBtn,
    clearUrlBtn,
    conversationUrlInput,
    urlStatus,
    runState,
    t,
    storageSet,
    storageRemove
  } = params;

  if (lockUrlBtn) {
    lockUrlBtn.addEventListener("click", async () => {
      const url = conversationUrlInput.value.trim();
      if (!url) {
        urlStatus.textContent = t("sidepanel.status.urlEnter");
        urlStatus.style.color = "var(--danger)";
        return;
      }
      const validation = validateLockedConversationUrl(url, t);
      if (!validation.ok) {
        urlStatus.textContent = t("sidepanel.status.validationError", {
          reason: validation.message
        });
        urlStatus.style.color = "var(--danger)";
        return;
      }
      runState.lockedConversationUrl = url;
      try {
        await storageSet({ lockedConversationUrl: url });
        urlStatus.textContent = t("sidepanel.status.urlLocked");
        urlStatus.style.color = "var(--success)";
        console.log(`[Panel] Locked conversation URL: ${url}`);
      } catch (err) {
        urlStatus.textContent = t("sidepanel.status.urlSaveFailed");
        urlStatus.style.color = "var(--danger)";
        console.error("[Panel] Failed to lock URL:", err);
      }
    });
  } else {
    console.warn("[Panel] Lock URL button not found");
  }

  if (clearUrlBtn) {
    clearUrlBtn.addEventListener("click", async () => {
      runState.lockedConversationUrl = "";
      conversationUrlInput.value = "";
      try {
        await storageRemove("lockedConversationUrl");
        urlStatus.textContent = t("sidepanel.lockedUrl.none");
        urlStatus.style.color = "var(--muted)";
        console.log("[Panel] Conversation URL lock cleared");
      } catch (err) {
        urlStatus.textContent = t("sidepanel.status.urlClearFailed");
        urlStatus.style.color = "var(--danger)";
        console.error("[Panel] Failed to clear URL:", err);
      }
    });
  } else {
    console.warn("[Panel] Clear URL button not found");
  }
}
