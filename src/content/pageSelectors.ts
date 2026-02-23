import { isButtonEnabled, isVisible } from "./domHelpers.js";

export function findInputField() {
  // More comprehensive selectors for both regular Gemini and Gems
  const selectors = [
    // Primary selectors for regular Gemini
    '.ql-editor.textarea[contenteditable="true"]',
    '.ql-editor[contenteditable="true"]',
    'div[role="textbox"][contenteditable="true"]',
    'rich-textarea .ql-editor[contenteditable="true"]',
    '[aria-label="Enter a prompt here"]',
    '[data-placeholder="Describe your image"]',
    // Additional selectors for Gemini Gems
    'input[placeholder*="Message"][type="text"]',
    'textarea[placeholder*="Message"]',
    'input.gem-input',
    'textarea.gem-textarea',
    '[data-testid="gem-input"]',
    // Fallback - any visible text input in the main area
    'main input[type="text"]',
    'main textarea',
    // Generic fallback
    'input[aria-label*="prompt"]',
    'textarea[aria-label*="prompt"]'
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
  // More comprehensive selectors for both regular Gemini and Gems
  const selectors = [
    // Primary selectors for regular Gemini
    'button[aria-label="Send message"]',
    "button.send-button",
    "button.submit",
    'button[mattooltip="Send message"]',
    // Additional selectors for Gemini Gems
    'button[aria-label*="Send"]',
    'button[type="submit"]',
    'button.gem-send-button',
    '[data-testid="send-button"]',
    // Generic button in form
    'form button[type="submit"]',
    'form button.primary',
    // SVG-based buttons (common in modern UI)
    'button:has(svg[width="20"])',
    'button:has(svg[width="24"])',
    // Fallback - any visible submit-like button near input
    'main button',
    'form button'
  ];
  for (const selector of selectors) {
    const button = document.querySelector<HTMLButtonElement>(selector);
    if (isVisible(button) && isButtonEnabled(button)) return button;
  }
  return null;
}
