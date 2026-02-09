import { getDownloadMenuItem, isVisible, normalizeText } from "./domHelpers.js";
import { findInputField } from "./pageSelectors.js";

export async function clickDownloadMenuItem(wait: (ms: number) => Promise<unknown>) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const menuItem = getDownloadMenuItem();
    if (menuItem && isVisible(menuItem)) {
      menuItem.click();
      return true;
    }
    await wait(150);
  }
  return false;
}

export async function writePrompt(params: {
  inputField: HTMLElement | null;
  prompt: string;
  wait: (ms: number) => Promise<unknown>;
  stepDelayMs: number;
}) {
  const { inputField, prompt, wait, stepDelayMs } = params;
  const normalizedPrompt = normalizeText(prompt);
  for (let attempt = 0; attempt < 2; attempt++) {
    const activeField = findInputField() || inputField;
    if (!activeField) return false;

    activeField.focus();
    try {
      const range = document.createRange();
      range.selectNodeContents(activeField);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
      document.execCommand("insertText", false, prompt);
    } catch {
      activeField.innerText = prompt;
    }

    ["keydown", "keypress", "textInput", "input", "keyup", "change"].forEach((evt) => {
      activeField.dispatchEvent(new Event(evt, { bubbles: true }));
    });

    await wait(Math.max(200, stepDelayMs / 5));
    const currentText = normalizeText(activeField.innerText);
    if (currentText && currentText.includes(normalizedPrompt)) return true;

    activeField.innerText = prompt;
    const inputEvent =
      typeof InputEvent === "function"
        ? new InputEvent("input", { bubbles: true, data: prompt })
        : new Event("input", { bubbles: true });
    activeField.dispatchEvent(inputEvent);
    await wait(Math.max(200, stepDelayMs / 5));

    const fallbackText = normalizeText(activeField.innerText);
    if (fallbackText && fallbackText.includes(normalizedPrompt)) return true;
  }

  return false;
}

export async function scrollToBottom(params: {
  wait: (ms: number) => Promise<unknown>;
  stepDelayMs: number;
}) {
  const { wait, stepDelayMs } = params;
  window.scrollTo({ top: document.body.scrollHeight, behavior: "auto" });
  const containers = ["#chat-history", ".chat-history-scroll-container", "main"];
  for (const selector of containers) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) {
      el.scrollTop = el.scrollHeight;
      if (el.lastElementChild) {
        el.lastElementChild.scrollIntoView({
          behavior: "smooth",
          block: "end"
        });
      }
    }
  }
  await wait(stepDelayMs);
}
