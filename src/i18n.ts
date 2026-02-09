export type Language = "en" | "zh";

export const LANGUAGE_STORAGE_KEY = "uiLanguage";
export const DEFAULT_LANGUAGE: Language = "en";

const translations: Record<Language, Record<string, string>> = {
  en: {
    "language.english": "English",
    "language.chinese": "Chinese",
    "time.short": "{{minutes}}m {{seconds}}s",
    "time.unknown": "--m --s",
    "time.remainingWithAvg": "{{remaining}} (avg {{avg}}s)",
    "options.documentTitle": "Gemini AutoGen Settings",
    "options.title": "Settings",
    "options.infoBox":
      "<strong>Important:</strong> To enable automatic file checking and renaming, you must authorize access to your <strong>Downloads</strong> folder.",
    "options.section.language": "Language",
    "options.language.label": "UI Language",
    "options.language.help": "Choose the display language for this extension.",
    "options.section.folders": "1. Folder Configuration",
    "options.section.timing": "2. Timing Settings",
    "options.source.label": "Source Folder (Where Chrome saves files)",
    "options.source.help":
      "Select the folder where Chrome downloads images (e.g., Downloads/Chrome).",
    "options.source.button": "Select Source Folder",
    "options.output.label": "Output Folder (Where we move files to)",
    "options.output.help":
      "Select the folder to save renamed images (e.g., Downloads/GeminiAutoGen).",
    "options.output.button": "Select Output Folder",
    "options.status.notSelected": "Not Selected",
    "options.timing.generationTimeout.label":
      "Image Generation Timeout (seconds)",
    "options.timing.generationTimeout.help":
      "Max wait time for image generation (Default: 120).",
    "options.timing.downloadTimeout.label":
      "Download Response Timeout (seconds)",
    "options.timing.downloadTimeout.help":
      "Max wait time for content-level download response checks (Default: 120).",
    "options.timing.downloadDetectTimeout.label":
      "Download Detect Timeout (seconds)",
    "options.timing.downloadDetectTimeout.help":
      "Max wait time to detect a new image file in source folder (Default: 120).",
    "options.timing.downloadStabilityTimeout.label":
      "Download Stabilization Timeout (seconds)",
    "options.timing.downloadStabilityTimeout.help":
      "Max wait time for detected file size to stabilize (Default: 120).",
    "options.timing.pageLoadTimeout.label": "Page Load / Stability (seconds)",
    "options.timing.pageLoadTimeout.help":
      "Wait for page load or stability (Default: 30).",
    "options.timing.inputTimeout.label": "Input Field Timeout (seconds)",
    "options.timing.inputTimeout.help":
      "Wait for prompt input to appear (Default: 5).",
    "options.timing.stepDelay.label": "Action Step Delay (seconds)",
    "options.timing.stepDelay.help":
      "Base delay between UI actions (Default: 1).",
    "options.timing.taskInterval.label": "Task Interval (seconds)",
    "options.timing.taskInterval.help":
      "Wait time between tasks (Default: 5).",
    "options.timing.maxRetries.label": "Max Retries Per Image",
    "options.timing.maxRetries.help":
      "Retries per task before stopping (Default: 3).",
    "options.timing.maxConsecutiveFailures.label": "Max Consecutive Failures",
    "options.timing.maxConsecutiveFailures.help":
      "Stop after this many consecutive failed tasks (Default: 5).",
    "options.timing.pollInterval.label": "Poll Interval (seconds)",
    "options.timing.pollInterval.help":
      "Used for input/send/generation/download checks (Default: 1).",
    "options.timing.save": "Save Timing Settings",
    "options.status.selected": "✅ Selected: {{name}}",
    "options.status.savedNeedsReselect":
      "⚠️ Saved: {{name}} (Re-select needed)",
    "options.status.settingsSaved": "✅ Settings Saved!",
    "options.status.errorSaving": "❌ Error Saving",
    "sidepanel.documentTitle": "Gemini AutoGen",
    "sidepanel.title": "Gemini AutoGen",
    "sidepanel.settings": "⚙️ Settings",
    "sidepanel.lockedUrl.label": "🔒 Locked Conversation URL",
    "sidepanel.lockedUrl.placeholder": "Paste Gemini chat URL here...",
    "sidepanel.lockedUrl.lock": "Lock",
    "sidepanel.lockedUrl.clear": "Clear",
    "sidepanel.lockedUrl.none": "No URL locked",
    "sidepanel.file.noFile": "No file loaded",
    "sidepanel.buttons.start": "Start",
    "sidepanel.buttons.stop": "Stop",
    "sidepanel.buttons.reset": "Reset",
    "sidepanel.status.ready": "Ready",
    "sidepanel.log.title": "Log",
    "sidepanel.log.copy": "Copy",
    "sidepanel.log.clear": "Clear",
    "sidepanel.log.toggle.hide": "Hide",
    "sidepanel.log.toggle.show": "Show",
    "sidepanel.status.urlLocked": "✅ URL locked - will use this conversation",
    "sidepanel.status.urlEnter": "❌ Please enter a URL",
    "sidepanel.status.validationError": "❌ {{reason}}",
    "sidepanel.status.urlSaveFailed": "❌ Failed to save URL",
    "sidepanel.status.urlClearFailed": "❌ Failed to clear URL",
    "sidepanel.status.loadedTasks": "Loaded {{count}} tasks",
    "sidepanel.status.errorInvalidJson": "Error: Invalid JSON",
    "sidepanel.status.lockUrlFirst": "Please lock a conversation URL first",
    "sidepanel.status.lockedUrlInvalid": "Locked URL invalid: {{reason}}",
    "sidepanel.status.uploadJson": "Please upload a JSON file",
    "sidepanel.status.failedToOpenTab": "Failed to open Gemini tab",
    "sidepanel.status.checkingExisting": "Checking existing files...",
    "sidepanel.status.skippedExisting": "Skipped {{count}} existing files",
    "sidepanel.status.allTasksCompleted": "All tasks completed!",
    "sidepanel.status.stoppedByUser": "Stopped by user",
    "sidepanel.status.resetComplete": "Reset complete - Load new tasks to start",
    "sidepanel.status.taskProgress": "Task {{current}} of {{total}}",
    "sidepanel.status.retryingDownload": "Retrying download...",
    "sidepanel.status.generating": "Generating...",
    "sidepanel.status.noActiveTab": "Error: No active Gemini tab",
    "sidepanel.status.refreshGemini": "Error: Please refresh Gemini page",
    "sidepanel.status.lockedUrlError": "Locked URL error",
    "sidepanel.status.folderAccessError": "Folder access error: {{error}}",
    "sidepanel.status.retrying": "Retrying",
    "sidepanel.status.retryingDownloadShort": "Retrying download",
    "sidepanel.status.retryingWithCount": "{{label}} ({{current}}/{{max}})...",
    "sidepanel.status.failed": "Failed: {{error}}",
    "sidepanel.status.stoppedAfterFailures":
      "Stopped after {{count}} consecutive failures. Last: {{error}}",
    "sidepanel.status.resettingBrowserContext": "Resetting browser context...",
    "sidepanel.status.errorCreateTab": "Error: Could not create Gemini tab",
    "sidepanel.status.lockedUrlMismatch": "Locked URL mismatch - reopening...",
    "sidepanel.currentFile": "📷 {{name}}",
    "sidepanel.currentFile.copied": "✓ Copied!",
    "sidepanel.log.summaryTitle": "--- Summary ---",
    "sidepanel.log.summary.total": "Total tasks: {{count}}",
    "sidepanel.log.summary.completed": "Completed: {{count}}",
    "sidepanel.log.summary.skipped": "Skipped: {{count}}",
    "sidepanel.log.summary.failed": "Failed: {{count}}",
    "sidepanel.log.summary.totalTime": "Total time: {{time}}",
    "sidepanel.log.summary.avgPerTask": "Avg per task: {{time}}",
    "content.status.retryingDownload": "Retrying download...",
    "content.status.downloading": "Downloading...",
    "content.status.waitingForFile": "Waiting for file...",
    "content.status.processing": "Processing: {{name}}",
    "content.status.skipped": "Skipped: {{name}}",
    "content.status.complete": "Complete: {{name}}",
    "content.status.generating": "Generating...",
    "content.status.error": "Error: {{message}}",
    "content.error.existingResponseNotFound":
      "Existing response not found for download-only retry",
    "content.error.noDownloadButtons": "No download buttons found after generation",
    "content.error.noDownloadButton": "No download button found after generation",
    "content.error.fileRenameFailed": "File rename failed",
    "content.error.lockedUrlRequired":
      "Locked conversation URL is required. Please lock a Gemini chat URL.",
    "content.error.lockedUrlMismatch":
      "Locked URL mismatch. Expected {{expected}}, got {{actual}}",
    "content.error.inputFieldNotFound": "Input field not found after wait",
    "content.error.pageStabilityTimeout":
      "Page stability timeout ({{seconds}}s) - images not loaded",
    "content.error.failedToWritePrompt": "Failed to write prompt into input field",
    "content.error.sendButtonNotFound": "Send button not found after wait",
    "content.error.promptAnchorNotFound":
      "Prompt anchor not found; aborting to avoid downloading the wrong image",
    "content.error.timeoutInputField": "Timeout waiting for Input Field",
    "content.error.timeoutSendButton": "Timeout waiting for Send Button",
    "content.error.sendDidNotClearInput": "Send click did not clear input",
    "content.error.timeoutPromptRender": "Timeout waiting for prompt render",
    "content.error.timeoutConversationContainer":
      "Timeout waiting for conversation container",
    "content.error.timeoutDownloadButton": "Timeout waiting for Download Button",
    "content.error.timeoutExistingResponse": "Timeout waiting for existing response",
    "validation.lockedUrl.mustGemini": "Locked URL must be a Gemini URL",
    "validation.lockedUrl.mustSpecificConversation":
      "Locked URL is a new conversation URL (use a specific chat URL)",
    "validation.lockedUrl.mustConversation":
      "Locked URL must be a Gemini conversation URL",
    "validation.lockedUrl.invalid": "Locked URL is invalid",
    "errors.missingDirectoryHandles":
      "Missing directory handles. Please configure in Options.",
    "errors.directoryIterationNotSupported":
      "Directory iteration is not supported in this browser.",
    "errors.imageSquareGenerationFailed":
      "Image is square (1:1). Generation failed (expected 16:9). Workflow stopped.",
    "errors.duplicateImage": "Duplicate image detected - workflow terminated",
    "errors.timeoutWaitingDownload": "Timeout waiting for download"
  },
  zh: {
    "language.english": "英文",
    "language.chinese": "中文",
    "time.short": "{{minutes}}分{{seconds}}秒",
    "time.unknown": "--分 --秒",
    "time.remainingWithAvg": "{{remaining}} (平均 {{avg}}秒)",
    "options.documentTitle": "Gemini AutoGen 设置",
    "options.title": "设置",
    "options.infoBox":
      "<strong>重要提示：</strong>要启用自动检查与重命名，请授权访问你的 <strong>Downloads</strong> 文件夹。",
    "options.section.language": "语言",
    "options.language.label": "界面语言",
    "options.language.help": "选择插件的显示语言。",
    "options.section.folders": "1. 文件夹配置",
    "options.section.timing": "2. 时间设置",
    "options.source.label": "源文件夹（Chrome 保存文件的位置）",
    "options.source.help": "选择 Chrome 下载图片的文件夹（例如：Downloads/Chrome）。",
    "options.source.button": "选择源文件夹",
    "options.output.label": "输出文件夹（文件移动到的位置）",
    "options.output.help": "选择保存重命名图片的文件夹（例如：Downloads/GeminiAutoGen）。",
    "options.output.button": "选择输出文件夹",
    "options.status.notSelected": "未选择",
    "options.timing.generationTimeout.label": "图片生成超时（秒）",
    "options.timing.generationTimeout.help": "图片生成最大等待时间（默认：120）。",
    "options.timing.downloadTimeout.label": "下载响应超时（秒）",
    "options.timing.downloadTimeout.help":
      "内容脚本下载响应检查最大等待时间（默认：120）。",
    "options.timing.downloadDetectTimeout.label": "下载检测超时（秒）",
    "options.timing.downloadDetectTimeout.help":
      "在源目录检测新图片文件的最大等待时间（默认：120）。",
    "options.timing.downloadStabilityTimeout.label": "下载稳定化超时（秒）",
    "options.timing.downloadStabilityTimeout.help":
      "检测到文件后等待其大小稳定的最大时间（默认：120）。",
    "options.timing.pageLoadTimeout.label": "页面加载/稳定等待（秒）",
    "options.timing.pageLoadTimeout.help": "等待页面加载或稳定（默认：30）。",
    "options.timing.inputTimeout.label": "输入框超时（秒）",
    "options.timing.inputTimeout.help": "等待提示输入出现（默认：5）。",
    "options.timing.stepDelay.label": "操作间隔（秒）",
    "options.timing.stepDelay.help": "UI 操作间的基础延迟（默认：1）。",
    "options.timing.taskInterval.label": "任务间隔（秒）",
    "options.timing.taskInterval.help": "任务之间的等待时间（默认：5）。",
    "options.timing.maxRetries.label": "单张图片最大重试次数",
    "options.timing.maxRetries.help": "每个任务的重试次数上限（默认：3）。",
    "options.timing.maxConsecutiveFailures.label": "最大连续失败次数",
    "options.timing.maxConsecutiveFailures.help": "连续失败达到该次数后停止（默认：5）。",
    "options.timing.pollInterval.label": "轮询间隔（秒）",
    "options.timing.pollInterval.help": "用于输入/发送/生成/下载检查（默认：1）。",
    "options.timing.save": "保存时间设置",
    "options.status.selected": "✅ 已选择：{{name}}",
    "options.status.savedNeedsReselect": "⚠️ 已保存：{{name}}（需要重新选择）",
    "options.status.settingsSaved": "✅ 设置已保存！",
    "options.status.errorSaving": "❌ 保存出错",
    "sidepanel.documentTitle": "Gemini AutoGen",
    "sidepanel.title": "Gemini AutoGen",
    "sidepanel.settings": "⚙️ 设置",
    "sidepanel.lockedUrl.label": "🔒 锁定的对话链接",
    "sidepanel.lockedUrl.placeholder": "在此粘贴 Gemini 对话链接...",
    "sidepanel.lockedUrl.lock": "锁定",
    "sidepanel.lockedUrl.clear": "清除",
    "sidepanel.lockedUrl.none": "未锁定链接",
    "sidepanel.file.noFile": "未加载文件",
    "sidepanel.buttons.start": "开始",
    "sidepanel.buttons.stop": "停止",
    "sidepanel.buttons.reset": "重置",
    "sidepanel.status.ready": "就绪",
    "sidepanel.log.title": "日志",
    "sidepanel.log.copy": "复制",
    "sidepanel.log.clear": "清空",
    "sidepanel.log.toggle.hide": "隐藏",
    "sidepanel.log.toggle.show": "显示",
    "sidepanel.status.urlLocked": "✅ 链接已锁定 - 将使用该对话",
    "sidepanel.status.urlEnter": "❌ 请输入链接",
    "sidepanel.status.validationError": "❌ {{reason}}",
    "sidepanel.status.urlSaveFailed": "❌ 保存链接失败",
    "sidepanel.status.urlClearFailed": "❌ 清除链接失败",
    "sidepanel.status.loadedTasks": "已加载 {{count}} 个任务",
    "sidepanel.status.errorInvalidJson": "错误：无效的 JSON",
    "sidepanel.status.lockUrlFirst": "请先锁定对话链接",
    "sidepanel.status.lockedUrlInvalid": "锁定链接无效：{{reason}}",
    "sidepanel.status.uploadJson": "请上传 JSON 文件",
    "sidepanel.status.failedToOpenTab": "无法打开 Gemini 标签页",
    "sidepanel.status.checkingExisting": "正在检查已有文件...",
    "sidepanel.status.skippedExisting": "已跳过 {{count}} 个已有文件",
    "sidepanel.status.allTasksCompleted": "所有任务已完成！",
    "sidepanel.status.stoppedByUser": "已被用户停止",
    "sidepanel.status.resetComplete": "重置完成 - 加载新任务以开始",
    "sidepanel.status.taskProgress": "第 {{current}} / {{total}} 个任务",
    "sidepanel.status.retryingDownload": "正在重试下载...",
    "sidepanel.status.generating": "正在生成...",
    "sidepanel.status.noActiveTab": "错误：没有活动的 Gemini 标签页",
    "sidepanel.status.refreshGemini": "错误：请刷新 Gemini 页面",
    "sidepanel.status.lockedUrlError": "锁定链接错误",
    "sidepanel.status.folderAccessError": "文件夹访问错误：{{error}}",
    "sidepanel.status.retrying": "正在重试",
    "sidepanel.status.retryingDownloadShort": "正在重试下载",
    "sidepanel.status.retryingWithCount": "{{label}}（{{current}}/{{max}}）...",
    "sidepanel.status.failed": "失败：{{error}}",
    "sidepanel.status.stoppedAfterFailures":
      "连续失败 {{count}} 次后停止。最后错误：{{error}}",
    "sidepanel.status.resettingBrowserContext": "正在重置浏览器上下文...",
    "sidepanel.status.errorCreateTab": "错误：无法创建 Gemini 标签页",
    "sidepanel.status.lockedUrlMismatch": "锁定链接不匹配 - 正在重新打开...",
    "sidepanel.currentFile": "📷 {{name}}",
    "sidepanel.currentFile.copied": "✓ 已复制！",
    "sidepanel.log.summaryTitle": "--- 汇总 ---",
    "sidepanel.log.summary.total": "任务总数：{{count}}",
    "sidepanel.log.summary.completed": "完成：{{count}}",
    "sidepanel.log.summary.skipped": "跳过：{{count}}",
    "sidepanel.log.summary.failed": "失败：{{count}}",
    "sidepanel.log.summary.totalTime": "总用时：{{time}}",
    "sidepanel.log.summary.avgPerTask": "平均每个任务：{{time}}",
    "content.status.retryingDownload": "正在重试下载...",
    "content.status.downloading": "正在下载...",
    "content.status.waitingForFile": "等待文件...",
    "content.status.processing": "处理中：{{name}}",
    "content.status.skipped": "已跳过：{{name}}",
    "content.status.complete": "完成：{{name}}",
    "content.status.generating": "正在生成...",
    "content.status.error": "错误：{{message}}",
    "content.error.existingResponseNotFound": "未找到可用于仅下载重试的已有响应",
    "content.error.noDownloadButtons": "生成后未找到下载按钮",
    "content.error.noDownloadButton": "生成后未找到下载按钮",
    "content.error.fileRenameFailed": "文件重命名失败",
    "content.error.lockedUrlRequired":
      "需要锁定的对话链接。请先锁定 Gemini 对话链接。",
    "content.error.lockedUrlMismatch":
      "锁定链接不匹配。期望 {{expected}}，实际 {{actual}}",
    "content.error.inputFieldNotFound": "等待后仍未找到输入框",
    "content.error.pageStabilityTimeout": "页面稳定超时（{{seconds}}秒）- 图片未加载",
    "content.error.failedToWritePrompt": "写入提示词失败",
    "content.error.sendButtonNotFound": "等待后仍未找到发送按钮",
    "content.error.promptAnchorNotFound":
      "未找到提示锚点；为避免下载错误图片已中止",
    "content.error.timeoutInputField": "等待输入框超时",
    "content.error.timeoutSendButton": "等待发送按钮超时",
    "content.error.sendDidNotClearInput": "点击发送后未清空输入框",
    "content.error.timeoutPromptRender": "等待提示渲染超时",
    "content.error.timeoutConversationContainer": "等待对话容器超时",
    "content.error.timeoutDownloadButton": "等待下载按钮超时",
    "content.error.timeoutExistingResponse": "等待已有响应超时",
    "validation.lockedUrl.mustGemini": "锁定链接必须是 Gemini 链接",
    "validation.lockedUrl.mustSpecificConversation":
      "锁定链接是新对话链接（请使用具体对话链接）",
    "validation.lockedUrl.mustConversation": "锁定链接必须是 Gemini 对话链接",
    "validation.lockedUrl.invalid": "锁定链接无效",
    "errors.missingDirectoryHandles": "缺少目录权限，请在设置中配置。",
    "errors.directoryIterationNotSupported": "此浏览器不支持目录遍历。",
    "errors.imageSquareGenerationFailed":
      "图片为正方形 (1:1)，生成失败（期望 16:9）。流程已停止。",
    "errors.duplicateImage": "检测到重复图片 - 已终止流程",
    "errors.timeoutWaitingDownload": "等待下载超时"
  }
};

const interpolate = (template: string, vars?: Record<string, string | number>) => {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key];
    return value === undefined ? "" : String(value);
  });
};

export const normalizeLanguage = (value?: string): Language =>
  value === "zh" ? "zh" : "en";

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

export const setStoredLanguage = (language: Language): Promise<void> =>
  chrome.storage.local.set({ [LANGUAGE_STORAGE_KEY]: language }) as Promise<void>;

export const applyI18n = (
  root: Document | HTMLElement,
  t: (key: string, vars?: Record<string, string | number>) => string
) => {
  const container = root instanceof Document ? root : root;

  container.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (!key) return;
    const text = t(key);
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
    ) {
      el.value = text;
    } else {
      el.textContent = text;
    }
  });

  container.querySelectorAll<HTMLElement>("[data-i18n-html]").forEach((el) => {
    const key = el.dataset.i18nHtml;
    if (!key) return;
    el.innerHTML = t(key);
  });

  container
    .querySelectorAll<HTMLElement>("[data-i18n-placeholder]")
    .forEach((el) => {
      const key = el.dataset.i18nPlaceholder;
      if (!key) return;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement
      ) {
        el.placeholder = t(key);
      }
    });

  container.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    const key = el.dataset.i18nTitle;
    if (!key) return;
    el.title = t(key);
  });

};
