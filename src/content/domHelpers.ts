export function isVisible(element: Element | null): element is HTMLElement {
  if (!element || !(element instanceof HTMLElement)) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none") return false;
  return true;
}

export function isButtonEnabled(button: HTMLButtonElement | null) {
  if (!button) return false;
  if (button.hasAttribute("disabled")) return false;
  if (button.getAttribute("aria-disabled") === "true") return false;
  if (button.classList.contains("disabled")) return false;
  return true;
}

export function getResponseReadyState(container: Element) {
  const ariaBusyAttr = container
    .querySelector("[aria-busy]")
    ?.getAttribute("aria-busy");
  const ariaBusy = ariaBusyAttr === "true";

  const footer = container.querySelector(".response-footer");
  const footerComplete = footer ? footer.classList.contains("complete") : false;

  const loader = container.querySelector(".loader, .loading-spinner");
  const hasVisibleLoader = loader ? isVisible(loader as HTMLElement) : false;

  const hasLoadedImage = container.querySelector("img.loaded") !== null;
  const ready = !ariaBusy && (footerComplete || hasLoadedImage);

  return {
    ready,
    ariaBusy: ariaBusy ? "true" : "false",
    footerComplete,
    hasVisibleLoader,
    hasLoadedImage
  };
}

export function getImageSrc(img: HTMLImageElement) {
  return img.currentSrc || img.src || "";
}

export function normalizeText(text: string) {
  return (text || "").replace(/\s+/g, " ").trim();
}

export function userQueryMatchesPrompt(
  query: Element | null,
  promptText: string,
  fullPrompt: string
) {
  if (!query) return false;
  const text = normalizeText(query.textContent || "").toLowerCase();
  const target = normalizeText(promptText).toLowerCase();
  const fullTarget = normalizeText(fullPrompt).toLowerCase();
  if (target && text.includes(target)) return true;
  if (fullTarget && text.includes(fullTarget)) return true;
  return false;
}

export function getDownloadMenuItemLabel(element: HTMLElement) {
  return (
    element.getAttribute("aria-label") ||
    element.getAttribute("mattooltip") ||
    element.textContent ||
    ""
  );
}

export function isDownloadMenuLabel(label: string) {
  const normalized = normalizeText(label).toLowerCase();
  if (!normalized) return false;
  if (!normalized.includes("download")) return false;
  if (normalized.includes("copy") || normalized.includes("share")) return false;
  return true;
}

export function getDownloadMenuItem() {
  const selectors = [
    "button[role=\"menuitem\"]",
    "[role=\"menuitem\"]",
    "button[mat-menu-item]",
    ".mat-mdc-menu-item",
    "button[aria-label*='Download']",
    "button[mattooltip*='Download']",
    "button[data-test-id*='download']",
    "a[download]"
  ];
  const candidates = new Set<HTMLElement>();
  const roots: ParentNode[] = [document];
  const overlay = document.querySelector<HTMLElement>(".cdk-overlay-container");
  if (overlay) {
    roots.unshift(overlay);
  }
  for (const root of roots) {
    for (const selector of selectors) {
      root
        .querySelectorAll<HTMLElement>(selector)
        .forEach((el) => candidates.add(el));
    }
  }
  for (const candidate of candidates) {
    if (candidate instanceof HTMLAnchorElement && candidate.hasAttribute("download")) {
      return candidate;
    }
    const label = getDownloadMenuItemLabel(candidate);
    if (isDownloadMenuLabel(label)) return candidate;
  }
  return null;
}

export function getDownloadBtns(
  includeHidden = false,
  root: ParentNode = document,
  includeDisabled = false
) {
  const selectors = [
    'button[aria-label="Download full size image"]',
    'button[aria-label="Download image"]',
    'button[aria-label*="Download"]',
    'button[mattooltip="Download full size"]',
    'button[mattooltip*="Download"]',
    'button[data-test-id*="download"]',
    "download-generated-image-button button"
  ];
  const buttons = new Set<HTMLButtonElement>();
  for (const selector of selectors) {
    root
      .querySelectorAll<HTMLButtonElement>(selector)
      .forEach((btn) => buttons.add(btn));
  }
  return Array.from(buttons).filter(
    (btn) =>
      (includeHidden || isVisible(btn)) &&
      (includeDisabled || isButtonEnabled(btn))
  );
}

export function isImageLoaded(img: HTMLImageElement) {
  if (!img) return false;
  if (img.classList.contains("loaded")) return true;
  return img.complete && img.naturalWidth > 0;
}

export function getGeneratedImageCandidates(root: ParentNode = document) {
  return Array.from(
    root.querySelectorAll<HTMLImageElement>(
      'img[src*="blob:"], img[src*="googleusercontent"], img[alt*="Generated"], generated-image img, single-image img'
    )
  );
}

export function getGeneratedImages(root: ParentNode = document) {
  return getGeneratedImageCandidates(root).filter(
    (img) => isVisible(img) && isImageLoaded(img) && img.width > 100
  );
}

export function getChatRoot() {
  const selectors = ["#chat-history", ".chat-history-scroll-container", "main"];
  for (const selector of selectors) {
    const el = document.querySelector<HTMLElement>(selector);
    if (isVisible(el)) return el;
  }
  return document.body;
}

export function getConversationContainer(anchor: Element | null) {
  if (!anchor) return null;
  const container = anchor.closest<HTMLElement>(
    ".conversation-container, .response-container, model-response"
  );
  if (container) return container;
  const userQuery = anchor.closest("user-query");
  if (userQuery && userQuery.parentElement instanceof HTMLElement) {
    return userQuery.parentElement;
  }
  return null;
}

export function getLastConversationContainer() {
  const containers = document.querySelectorAll<HTMLElement>(
    ".conversation-container, .response-container, model-response"
  );
  if (!containers.length) return null;
  return containers[containers.length - 1] as HTMLElement;
}

export function getLastGeneratedImageInConversation(container: Element | null) {
  if (!container) return null;
  const images = getGeneratedImageCandidates(container);
  if (!images.length) return null;
  return images[images.length - 1] as HTMLImageElement;
}

export type ConversationMatch = { container: HTMLElement; userQuery: HTMLElement };

export function findConversationByPrompt(promptText: string, nameText: string) {
  const containers = Array.from(
    document.querySelectorAll<HTMLElement>(
      ".conversation-container, .response-container, model-response"
    )
  );
  const targetName = normalizeText(nameText).toLowerCase();
  const targetPrompt = normalizeText(promptText).toLowerCase();

  let lastMatch: ConversationMatch | null = null;
  for (const container of containers) {
    const userQuery = container.querySelector("user-query");
    if (!userQuery) continue;
    const text = normalizeText(userQuery.textContent || "").toLowerCase();
    if (targetName && text.includes(targetName)) {
      lastMatch = { container, userQuery: userQuery as HTMLElement };
    } else if (targetPrompt && text.includes(targetPrompt)) {
      lastMatch = { container, userQuery: userQuery as HTMLElement };
    }
  }
  return lastMatch;
}

export function getLoadedImagesInContainer(container: Element): HTMLImageElement[] {
  const images = Array.from(
    container.querySelectorAll<HTMLImageElement>(
      'img[src*="blob:"], img[src*="googleusercontent"], img[alt*="Generated"], generated-image img, single-image img'
    )
  );
  return images.filter(
    (img) => isImageLoaded(img) && (img.naturalWidth > 100 || img.width > 100)
  );
}

export function getDownloadButtonInConversation(
  container: Element
): HTMLButtonElement | null {
  const selectors = [
    "download-generated-image-button button",
    'button[data-test-id="download-generated-image-button"]',
    'button[aria-label="Download full size image"]',
    'button[mattooltip="Download full size"]',
    'button[aria-label*="Download"]',
    'button[mattooltip*="Download"]'
  ];
  let fallback: HTMLButtonElement | null = null;
  for (const selector of selectors) {
    const btn = container.querySelector<HTMLButtonElement>(selector);
    if (!btn) continue;
    if (!fallback) fallback = btn;
    if (isButtonEnabled(btn)) return btn;
  }
  return fallback;
}

export function getElementsAfterAnchor<T extends Element>(
  elements: T[],
  anchor: Element | null
) {
  if (!anchor) return elements;
  return elements.filter(
    (el) => anchor.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING
  );
}

export function getResponseContainerForAnchor(anchor: Element | null) {
  if (!anchor) return null;
  const responseSelector =
    ".presented-response-container, model-response, .response-container, .response-container-content, .response-content";
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(responseSelector)
  );
  const after = getElementsAfterAnchor(candidates, anchor);
  if (!after.length) return null;
  const first = after[0];
  return first.closest<HTMLElement>(".presented-response-container") || first;
}

export function findPromptAnchor(promptText: string) {
  const target = normalizeText(promptText).toLowerCase();
  if (!target) return null;
  const root = getChatRoot();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      if (!isVisible(node as Element)) return NodeFilter.FILTER_SKIP;
      if ((node as Element).children.length > 0) {
        return NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let found: HTMLElement | null = null;
  while (walker.nextNode()) {
    const node = walker.currentNode as HTMLElement;
    const text = normalizeText(node.textContent || "").toLowerCase();
    if (text.includes(target)) {
      found = node;
    }
  }
  return found;
}

export function findUserQueryByPromptText(promptText: string) {
  const target = normalizeText(promptText).toLowerCase();
  if (!target) return null;
  const queries = Array.from(document.querySelectorAll<HTMLElement>("user-query"));
  let matched: HTMLElement | null = null;
  for (const query of queries) {
    const text = normalizeText(query.textContent || "").toLowerCase();
    if (text.includes(target)) {
      matched = query;
    }
  }
  return matched;
}

export function getDownloadButtonsInContainer(
  container: Element,
  includeHidden = false,
  includeDisabled = false
) {
  return getDownloadBtns(includeHidden, container, includeDisabled);
}

export function getDownloadButtonForImage(image: HTMLImageElement | null) {
  if (!image) return null;
  const containerEl = image.closest(
    ".attachment-container, .generated-images, .response-container, .overlay-container, .image-container"
  );
  if (!containerEl) return null;
  const button = containerEl.querySelector<HTMLButtonElement>(
    'download-generated-image-button button, button[data-test-id="download-generated-image-button"], button[aria-label*="Download"], button[mattooltip*="Download"]'
  );
  return button || null;
}
