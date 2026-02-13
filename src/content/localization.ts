export type Language = "en" | "zh";

const LANGUAGE_STORAGE_KEY = "uiLanguage";
const DEFAULT_LANGUAGE: Language = "en";

const translations: Record<Language, Record<string, string>> = {
  en: {
    "content.status.retryingDownload": "Retrying download...",
    "content.status.downloading": "Downloading...",
    "content.status.waitingForFile": "Waiting for file...",
    "content.status.processing": "Processing: {{name}}",
    "content.status.skipped": "Skipped: {{name}}",
    "content.status.warningDetectedSkip":
      "Warning detected, skipped for prompt update: {{name}}",
    "content.status.complete": "Complete: {{name}}",
    "content.status.generating": "Generating...",
    "content.status.error": "Error: {{message}}",
    "content.error.existingResponseNotFound":
      "Existing response not found for download-only retry",
    "content.error.timeoutExistingResponse":
      "Timeout waiting for existing response",
    "content.error.noDownloadButtons": "No download buttons found after generation",
    "content.error.noDownloadButton": "No download button found after generation",
    "content.error.fileRenameFailed": "File rename failed",
    "content.error.lockedUrlRequired":
      "Locked conversation URL is required. Please lock a Gemini chat URL.",
    "content.error.lockedUrlMismatch":
      "Locked URL mismatch. Expected {{expected}}, got {{actual}}",
    "content.error.timeoutInputField": "Timeout waiting for Input Field",
    "content.error.inputFieldNotFound": "Input field not found after wait",
    "content.error.pageStabilityTimeout":
      "Page stability timeout ({{seconds}}s) - images not loaded",
    "content.error.failedToWritePrompt": "Failed to write prompt into input field",
    "content.error.timeoutSendButton": "Timeout waiting for Send Button",
    "content.error.sendButtonNotFound": "Send button not found after wait",
    "content.error.sendDidNotClearInput": "Send click did not clear input",
    "content.error.timeoutPromptRender": "Timeout waiting for prompt render",
    "content.error.timeoutConversationContainer":
      "Timeout waiting for conversation container",
    "content.error.promptAnchorNotFound":
      "Prompt anchor not found; aborting to avoid downloading the wrong image",
    "content.error.timeoutDownloadButton": "Timeout waiting for Download Button",
    "content.error.downloadTriggerNotDetected":
      "Download was not triggered after clicking the button",
    "errors.timeoutWaitingDownload": "Timeout waiting for download",
    "validation.lockedUrl.mustGemini": "Locked URL must be a Gemini URL",
    "validation.lockedUrl.mustSpecificConversation":
      "Locked URL is a new conversation URL (use a specific chat URL)",
    "validation.lockedUrl.mustConversation":
      "Locked URL must be a Gemini conversation URL",
    "validation.lockedUrl.invalid": "Locked URL is invalid"
  },
  zh: {
    "content.status.retryingDownload": "正在重试下载...",
    "content.status.downloading": "正在下载...",
    "content.status.waitingForFile": "等待文件...",
    "content.status.processing": "处理中：{{name}}",
    "content.status.skipped": "已跳过：{{name}}",
    "content.status.warningDetectedSkip": "检测到警告，已跳过并请修改提示词：{{name}}",
    "content.status.complete": "完成：{{name}}",
    "content.status.generating": "正在生成...",
    "content.status.error": "错误：{{message}}",
    "content.error.existingResponseNotFound": "未找到可用于仅下载重试的已有响应",
    "content.error.timeoutExistingResponse": "等待已有响应超时",
    "content.error.noDownloadButtons": "生成后未找到下载按钮",
    "content.error.noDownloadButton": "生成后未找到下载按钮",
    "content.error.fileRenameFailed": "文件重命名失败",
    "content.error.lockedUrlRequired":
      "需要锁定的对话链接。请先锁定 Gemini 对话链接。",
    "content.error.lockedUrlMismatch":
      "锁定链接不匹配。期望 {{expected}}，实际 {{actual}}",
    "content.error.timeoutInputField": "等待输入框超时",
    "content.error.inputFieldNotFound": "等待后仍未找到输入框",
    "content.error.pageStabilityTimeout": "页面稳定超时（{{seconds}}秒）- 图片未加载",
    "content.error.failedToWritePrompt": "写入提示词失败",
    "content.error.timeoutSendButton": "等待发送按钮超时",
    "content.error.sendButtonNotFound": "等待后仍未找到发送按钮",
    "content.error.sendDidNotClearInput": "点击发送后未清空输入框",
    "content.error.timeoutPromptRender": "等待提示渲染超时",
    "content.error.timeoutConversationContainer": "等待对话容器超时",
    "content.error.promptAnchorNotFound":
      "未找到提示锚点；为避免下载错误图片已中止",
    "content.error.timeoutDownloadButton": "等待下载按钮超时",
    "content.error.downloadTriggerNotDetected": "点击按钮后未检测到下载触发",
    "errors.timeoutWaitingDownload": "等待下载超时",
    "validation.lockedUrl.mustGemini": "锁定链接必须是 Gemini 链接",
    "validation.lockedUrl.mustSpecificConversation":
      "锁定链接是新对话链接（请使用具体对话链接）",
    "validation.lockedUrl.mustConversation": "锁定链接必须是 Gemini 对话链接",
    "validation.lockedUrl.invalid": "锁定链接无效"
  }
};

const normalizeLanguage = (value?: string): Language =>
  value === "zh" ? "zh" : "en";

const interpolate = (template: string, vars?: Record<string, string | number>) => {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key];
    return value === undefined ? "" : String(value);
  });
};

export const createTranslator = (language: Language) =>
  (key: string, vars?: Record<string, string | number>) => {
    const template = translations[language][key] || translations.en[key] || key;
    return interpolate(template, vars);
  };

export const getStoredLanguage = async (): Promise<Language> => {
  const result = (await chrome.storage.local.get([
    LANGUAGE_STORAGE_KEY
  ])) as unknown as Record<string, unknown>;
  return normalizeLanguage(result[LANGUAGE_STORAGE_KEY] as string | undefined);
};

export const defaultContentTranslator = () => createTranslator(DEFAULT_LANGUAGE);
