export type ScriptInjection = chrome.scripting.ScriptInjection<unknown[], unknown>;
export type InjectionResult = chrome.scripting.InjectionResult<unknown>;

export const storageGet = <T,>(keys: string[]): Promise<T> =>
  chrome.storage.local.get(keys) as unknown as Promise<T>;

export const storageSet = (items: Record<string, unknown>): Promise<void> =>
  chrome.storage.local.set(items) as unknown as Promise<void>;

export const storageRemove = (keys: string | string[]): Promise<void> =>
  chrome.storage.local.remove(keys) as unknown as Promise<void>;

export const storageClear = (): Promise<void> =>
  chrome.storage.local.clear() as unknown as Promise<void>;

export const runtimeSendMessage = <T,>(message: unknown): Promise<T> =>
  chrome.runtime.sendMessage(message) as unknown as Promise<T>;

export const tabsQuery = (
  queryInfo: chrome.tabs.QueryInfo
): Promise<chrome.tabs.Tab[]> =>
  chrome.tabs.query(queryInfo) as unknown as Promise<chrome.tabs.Tab[]>;

export const tabsUpdate = (
  tabId: number,
  props: chrome.tabs.UpdateProperties
): Promise<chrome.tabs.Tab> =>
  chrome.tabs.update(tabId, props) as unknown as Promise<chrome.tabs.Tab>;

export const tabsCreate = (
  props: chrome.tabs.CreateProperties
): Promise<chrome.tabs.Tab> =>
  chrome.tabs.create(props) as unknown as Promise<chrome.tabs.Tab>;

export const tabsGet = (tabId: number): Promise<chrome.tabs.Tab> =>
  chrome.tabs.get(tabId) as unknown as Promise<chrome.tabs.Tab>;

export const tabsRemove = (tabId: number): Promise<void> =>
  chrome.tabs.remove(tabId) as unknown as Promise<void>;

export const executeScript = (
  injection: ScriptInjection
): Promise<InjectionResult[]> =>
  chrome.scripting.executeScript(
    injection
  ) as unknown as Promise<InjectionResult[]>;
