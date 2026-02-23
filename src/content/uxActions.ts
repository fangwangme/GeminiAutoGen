import { getDownloadMenuItem, isVisible, normalizeText } from "./domHelpers.js";
import { findInputField } from "./pageSelectors.js";
// Find or create a file input for image attachments in Gemini
function getOrCreateFileInput(): HTMLInputElement | null {
  // First try to find an existing hidden file input
  const existingInput = document.querySelector<HTMLInputElement>(
    'input[type="file"][accept*="image"][hidden], input[type="file"][data-testid="upload-button"]'
  );
  if (existingInput) return existingInput;

  // Try to find the attachment button and get its associated input
  const attachmentButtonSelectors = [
    'button[aria-label*="Add image"]',
    'button[aria-label*="Upload image"]',
    'button[aria-label*="Attach"]',
    'button[data-testid="upload-button"]',
    'button[mattooltip*="Upload"]',
    'button[mattooltip*="image"]',
    'button[mattooltip*="Attach"]',
    'button[aria-label="Add attachments"]'
  ];
  
  for (const selector of attachmentButtonSelectors) {
    const button = document.querySelector<HTMLButtonElement>(selector);
    if (button) {
      // Look for associated file input near the button
      const form = button.closest('form');
      if (form) {
        const fileInput = form.querySelector<HTMLInputElement>('input[type="file"]');
        if (fileInput) return fileInput;
      }
      // Check parent containers
      const parent = button.parentElement;
      if (parent) {
        const fileInput = parent.querySelector<HTMLInputElement>('input[type="file"]');
        if (fileInput) return fileInput;
      }
    }
  }

  return null;
}

// Find the image attachment button in Gemini UI
function findAttachmentButton(): HTMLButtonElement | null {
  const selectors = [
    'button[aria-label*="Add image"]',
    'button[aria-label*="Upload image"]',
    'button[aria-label*="Attach"]',
    'button[data-testid="upload-button"]',
    'button[mattooltip*="Upload"]',
    'button[mattooltip*="image"]',
    'button[mattooltip*="Attach"]',
    'button[aria-label="Add attachments"]',
    'button[aria-label="Add image or file"]',
    'button[aria-label="Add photo"]'
  ];

  for (const selector of selectors) {
    const button = document.querySelector<HTMLButtonElement>(selector);
    if (button && isVisible(button)) {
      return button;
    }
  }
  return null;
}

// Attach images to the Gemini prompt input
// Accepts array of base64 data URLs or Blob URLs
export async function attachImages(params: {
  imageUrls: string[]; // Array of data URLs or Blob URLs
  wait: (ms: number) => Promise<unknown>;
  stepDelayMs: number;
}): Promise<boolean> {
  const { imageUrls, wait, stepDelayMs } = params;

  if (!imageUrls || imageUrls.length === 0) {
    return true; // No images to attach
  }

  // Try to find attachment button first
  const attachButton = findAttachmentButton();
  
  // Also try to find file input directly
  let fileInput = getOrCreateFileInput();

  // If no file input found, try clicking the attachment button to reveal it
  if (!fileInput && attachButton) {
    attachButton.click();
    await wait(500);
    fileInput = getOrCreateFileInput();
  }

  // Last resort: create a hidden file input
  if (!fileInput) {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
  }

  // Convert data URLs/Blob URLs to File objects
  const files: File[] = [];
  for (const url of imageUrls) {
    try {
      let file: File;
      if (url.startsWith('data:')) {
        // Parse data URL
        const response = await fetch(url);
        const blob = await response.blob();
        const filename = url.split('/').pop()?.split(';')[0] || 'image.jpg';
        file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
      } else if (url.startsWith('blob:')) {
        // Fetch blob URL and create File
        const response = await fetch(url);
        const blob = await response.blob();
        file = new File([blob], 'image.jpg', { type: blob.type || 'image/jpeg' });
      } else {
        // Assume it's a file path - skip (sidepanel should handle this)
        console.warn('[UX] Unsupported image URL format:', url);
        continue;
      }
      files.push(file);
    } catch (err) {
      console.error('[UX] Failed to process image:', url, err);
    }
  }

  if (files.length === 0) {
    console.warn('[UX] No valid image files to attach');
    return false;
  }

  // Create a DataTransfer to set multiple files
  const dataTransfer = new DataTransfer();
  files.forEach(file => dataTransfer.items.add(file));
  fileInput.files = dataTransfer.files;

  // Dispatch change event to trigger Gemini's upload handling
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  
  // Wait for images to be attached
  await wait(stepDelayMs * 2);

  // Verify images are attached by checking for preview elements
  const previewSelectors = [
    '.attachment-preview',
    '.image-preview',
    '[data-testid="attachment-preview"]',
    '.uploaded-image',
    'img[src*="blob:"]'
  ];
  
  for (const selector of previewSelectors) {
    const previews = document.querySelectorAll(selector);
    if (previews.length >= files.length) {
      console.log(`[UX] Attached ${files.length} image(s)`);
      return true;
    }
  }

  // Also check if the input has files
  if (fileInput.files && fileInput.files.length > 0) {
    console.log(`[UX] Attached ${fileInput.files.length} image(s) via file input`);
    return true;
  }

  return false;
}

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

// Helper to get text content from either contenteditable or regular input/textarea
function getFieldText(field: HTMLElement): string {
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    return field.value;
  }
  return field.innerText || '';
}

// Helper to set text content in either contenteditable or regular input/textarea
function setFieldText(field: HTMLElement, text: string): void {
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    field.value = text;
  } else {
    field.innerText = text;
  }
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
    
    // Check if it's a regular input/textarea vs contenteditable
    const isRegularInput = activeField instanceof HTMLInputElement || activeField instanceof HTMLTextAreaElement;
    
    if (isRegularInput) {
      // Handle regular input/textarea (used in Gems)
      (activeField as HTMLInputElement | HTMLTextAreaElement).value = prompt;
      activeField.dispatchEvent(new Event('input', { bubbles: true }));
      activeField.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // Handle contenteditable (standard Gemini)
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
    }

    await wait(Math.max(200, stepDelayMs / 5));
    const currentText = normalizeText(getFieldText(activeField));
    if (currentText && currentText.includes(normalizedPrompt)) return true;

    // Fallback: try direct assignment
    setFieldText(activeField, prompt);
    activeField.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(Math.max(200, stepDelayMs / 5));

    const fallbackText = normalizeText(getFieldText(activeField));
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
