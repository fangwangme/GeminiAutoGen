import { isVisible } from "./domHelpers.js";

const fireMouseEvent = (target: Element, type: string) => {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window
    })
  );
};

export function revealDownloadButton(button: HTMLButtonElement) {
  button.scrollIntoView({ block: "center", inline: "center" });
  const container = button.closest(
    ".overlay-container, .generated-image, .image-container, .attachment-container"
  );
  if (container) {
    ["mouseenter", "mouseover", "mousemove"].forEach((event) =>
      fireMouseEvent(container, event)
    );
  }
  const imageButton = button
    .closest(".overlay-container")
    ?.querySelector<HTMLButtonElement>("button.image-button");
  if (imageButton) {
    ["mouseenter", "mouseover", "mousemove"].forEach((event) =>
      fireMouseEvent(imageButton, event)
    );
  }
  ["mouseenter", "mouseover", "mousemove"].forEach((event) =>
    fireMouseEvent(button, event)
  );
}

export function clickDownloadButton(button: HTMLButtonElement) {
  button.focus({ preventScroll: true });
  ["pointerdown", "mousedown"].forEach((event) =>
    fireMouseEvent(button, event)
  );
  button.click();
  ["mouseup", "pointerup"].forEach((event) => fireMouseEvent(button, event));
}

export function isClickable(button: HTMLButtonElement) {
  const style = window.getComputedStyle(button);
  if (style.pointerEvents === "none") return false;
  if (style.display === "none") return false;
  if (style.visibility === "hidden") return false;
  if (!isVisible(button)) return false;
  const rect = button.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  return true;
}
