import { isButtonEnabled, isVisible } from "./domHelpers.js";

export function findInputField() {
  const selectors = [
    '.ql-editor.textarea[contenteditable="true"]',
    '.ql-editor[contenteditable="true"]',
    'div[role="textbox"][contenteditable="true"]',
    'rich-textarea .ql-editor[contenteditable="true"]',
    '[aria-label="Enter a prompt here"]',
    '[data-placeholder="Describe your image"]'
  ];
  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector);
    if (isVisible(element)) return element;
  }
  return null;
}

export function isGeminiPageReady(): {
  ready: boolean;
  details: Record<string, unknown>;
} {
  const docReady = document.readyState === "complete";
  const hasInputField = findInputField() !== null;

  const chatSelectors = [
    "#chat-history",
    ".chat-history-scroll-container",
    "main[role='main']",
    ".conversation-container"
  ];
  let hasChatContainer = false;
  for (const selector of chatSelectors) {
    const element = document.querySelector<HTMLElement>(selector);
    if (isVisible(element)) {
      hasChatContainer = true;
      break;
    }
  }

  const loadingSelectors = [
    ".loading-spinner",
    ".skeleton-loader",
    "[aria-busy='true']",
    ".mat-progress-spinner"
  ];
  let hasLoadingIndicator = false;
  for (const selector of loadingSelectors) {
    const element = document.querySelector<HTMLElement>(selector);
    if (isVisible(element)) {
      hasLoadingIndicator = true;
      break;
    }
  }

  const appRoot = document.querySelector<HTMLElement>(
    "bard-sidenav-container, chat-window, main"
  );
  const hasAppRoot = appRoot !== null && isVisible(appRoot);

  const ready =
    docReady &&
    hasInputField &&
    hasChatContainer &&
    !hasLoadingIndicator &&
    hasAppRoot;

  return {
    ready,
    details: {
      docReady,
      hasInputField,
      hasChatContainer,
      hasLoadingIndicator,
      hasAppRoot
    }
  };
}

export function getStopButton() {
  const selectors = [
    'button[aria-label="Stop responding"]',
    'button[mattooltip="Stop responding"]'
  ];
  for (const selector of selectors) {
    const button = document.querySelector<HTMLButtonElement>(selector);
    if (isVisible(button)) return button;
  }
  return null;
}

export function getSendButton() {
  const selectors = [
    'button[aria-label="Send message"]',
    "button.send-button",
    "button.submit",
    'button[mattooltip="Send message"]'
  ];
  for (const selector of selectors) {
    const button = document.querySelector<HTMLButtonElement>(selector);
    if (isVisible(button) && isButtonEnabled(button)) return button;
  }
  return null;
}
