import { shouldCreatePlaceholder as shouldCreatePlaceholderByCount } from "../utils/placeholderPolicy.js";

type TabsGet = (tabId: number) => Promise<chrome.tabs.Tab>;
type TabsCreate = (props: chrome.tabs.CreateProperties) => Promise<chrome.tabs.Tab>;
type TabsRemove = (tabId: number) => Promise<void>;
type TabsQuery = (
  queryInfo: chrome.tabs.QueryInfo
) => Promise<chrome.tabs.Tab[]>;

type Translator = (key: string, vars?: Record<string, string | number>) => string;

export const shouldCreatePlaceholder = (tabsCount: number): boolean => {
  return shouldCreatePlaceholderByCount(tabsCount);
};

export async function waitForPageLoad(
  tabId: number,
  timeoutMs: number,
  tabsGet: TabsGet
) {
  console.log(`[Panel] Waiting for tab ${tabId} to load...`);

  try {
    const tab = await tabsGet(tabId);
    if (tab.status === "complete") {
      console.log(`[Panel] Tab ${tabId} already complete.`);
      return;
    }
  } catch (err) {
    console.warn("[Panel] Failed to check tab status immediately:", err);
  }

  return new Promise<void>((resolve) => {
    let resolved = false;

    const done = (reason: string) => {
      if (resolved) return;
      resolved = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearInterval(pollInterval);
      console.log(`[Panel] Tab ${tabId} load finished (${reason})`);
      resolve();
    };

    const listener = (
      updatedTabId: number,
      changeInfo: chrome.tabs.TabChangeInfo
    ) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        done("event");
      }
    };
    chrome.tabs.onUpdated.addListener(listener);

    const pollInterval = setInterval(async () => {
      try {
        const tab = await tabsGet(tabId);
        if (tab.status === "complete") {
          done("polling");
        }
      } catch {
        done("error-polling");
      }
    }, 1000);

    setTimeout(() => {
      done("timeout");
    }, timeoutMs);
  });
}

export async function ensureLockedConversationTab(params: {
  tabId: number;
  pageLoadTimeout: number;
  normalizedStepDelay: number | undefined;
  reason: string;
  lockedConversationUrl: string;
  t: Translator;
  tabsGet: TabsGet;
  tabsCreate: TabsCreate;
  tabsRemove: TabsRemove;
  setCurrentTabId: (tabId: number | null) => void;
  getCurrentTabId: () => number | null;
  setIsRunning: (running: boolean) => void;
  updateUI: (running: boolean) => void;
  setStatus: (text: string, color: string) => void;
  waitForPageLoad: (tabId: number, timeoutMs: number) => Promise<void>;
}) {
  const {
    tabId,
    pageLoadTimeout,
    normalizedStepDelay,
    reason,
    lockedConversationUrl,
    t,
    tabsGet,
    tabsCreate,
    tabsRemove,
    setCurrentTabId,
    getCurrentTabId,
    setIsRunning,
    updateUI,
    setStatus,
    waitForPageLoad
  } = params;

  if (!lockedConversationUrl) return true;
  try {
    const tab = await tabsGet(tabId);
    const currentUrl = tab.url || "";
    const urlMatch = (() => {
      const normalize = (u: string) => {
        try {
          const parsed = new URL(u);
          const path = parsed.pathname.replace(/\/$/, "");
          return `${parsed.origin}${path}`;
        } catch {
          return u.replace(/\/$/, "");
        }
      };
      return normalize(lockedConversationUrl) === normalize(currentUrl);
    })();
    if (currentUrl && urlMatch) {
      return true;
    }
    console.warn(
      `[Panel] Locked URL mismatch (${reason}). Expected ${lockedConversationUrl}, got ${currentUrl}`
    );
    setStatus(t("sidepanel.status.lockedUrlMismatch"), "var(--warning)");

    const currentTabId = getCurrentTabId();
    if (currentTabId) {
      try {
        await tabsRemove(currentTabId);
      } catch (err) {
        console.log("[Panel] Tab already closed:", err);
      }
    }

    const freshTab = await tabsCreate({ url: lockedConversationUrl });
    const nextTabId = freshTab.id ?? null;
    setCurrentTabId(nextTabId);

    if (!nextTabId) {
      setStatus(t("sidepanel.status.errorCreateTab"), "var(--danger)");
      setIsRunning(false);
      updateUI(false);
      return false;
    }

    await waitForPageLoad(nextTabId, pageLoadTimeout);
    const tabReadyDelayMs = (normalizedStepDelay || 1) * 2 * 1000;
    await new Promise((r) => setTimeout(r, tabReadyDelayMs));
    return true;
  } catch (err) {
    console.warn("[Panel] Failed to validate locked URL:", err);
    return true;
  }
}

export async function closeCurrentTabWithPlaceholder(params: {
  currentTabId: number | null;
  tabsGet: TabsGet;
  tabsQuery: TabsQuery;
  tabsCreate: TabsCreate;
  tabsRemove: TabsRemove;
}) {
  const { currentTabId, tabsGet, tabsQuery, tabsCreate, tabsRemove } = params;
  if (!currentTabId) return;
  try {
    const tab = await tabsGet(currentTabId);
    const windowTabs = await tabsQuery({ windowId: tab.windowId });
    if (shouldCreatePlaceholder(windowTabs.length)) {
      console.log("[Panel] Last tab in window, creating placeholder...");
      await tabsCreate({ windowId: tab.windowId, active: false, url: "about:blank" });
    }
    await tabsRemove(currentTabId);
  } catch (err) {
    console.log("[Panel] Tab already closed or window error:", err);
  }
}
