export const urlsMatch = (url1: string, url2: string): boolean => {
  const normalize = (u: string) => {
    try {
      const parsed = new URL(u);
      const path = parsed.pathname.replace(/\/$/, "");
      return `${parsed.origin}${path}`;
    } catch {
      return u.replace(/\/$/, "");
    }
  };
  return normalize(url1) === normalize(url2);
};

const isGeminiHost = (hostname: string): boolean => {
  return hostname === "gemini.google.com" || hostname.endsWith(".gemini.google.com");
};

export const validateLockedConversationUrl = (
  url: string,
  t: (key: string) => string
): { ok: boolean; message?: string } => {
  try {
    const parsed = new URL(url);
    if (!isGeminiHost(parsed.hostname)) {
      return { ok: false, message: t("validation.lockedUrl.mustGemini") };
    }
    const path = parsed.pathname.replace(/\/$/, "").replace(/^\/u\/\d+/, "");
    if (path === "/app") {
      return {
        ok: false,
        message: t("validation.lockedUrl.mustSpecificConversation")
      };
    }
    if (path.includes("/app/")) {
      return { ok: true };
    }
    return { ok: false, message: t("validation.lockedUrl.mustConversation") };
  } catch {
    return { ok: false, message: t("validation.lockedUrl.invalid") };
  }
};
