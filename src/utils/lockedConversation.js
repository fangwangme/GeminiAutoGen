export const normalizeUrlForCompare = (url) => {
  try {
    const parsed = new URL(url);
    const normalizedPath = parsed.pathname.replace(/\/$/, "");
    return `${parsed.origin}${normalizedPath}`;
  } catch {
    return url.replace(/\/$/, "");
  }
};

export const urlsMatch = (lockedUrl, currentUrl) =>
  normalizeUrlForCompare(lockedUrl) === normalizeUrlForCompare(currentUrl);

export const isGeminiHost = (hostname) =>
  hostname === "gemini.google.com" || hostname.endsWith(".gemini.google.com");

export const validateLockedConversationUrl = (url, t) => {
  try {
    const parsed = new URL(url);
    if (!isGeminiHost(parsed.hostname)) {
      return {
        ok: false,
        message: t("validation.lockedUrl.mustGemini")
      };
    }
    const normalizedPath = parsed.pathname.replace(/\/$/, "");
    const pathWithoutAccount = normalizedPath.replace(/^\/u\/\d+/, "");
    if (pathWithoutAccount === "/app") {
      return {
        ok: false,
        message: t("validation.lockedUrl.mustSpecificConversation")
      };
    }
    const isValidConversation = pathWithoutAccount.startsWith("/app/") || pathWithoutAccount.startsWith("/gem/");
    if (!isValidConversation) {
      return {
        ok: false,
        message: t("validation.lockedUrl.mustConversation")
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: t("validation.lockedUrl.invalid") };
  }
};
