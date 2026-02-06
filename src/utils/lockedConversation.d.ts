export type Translator = (
  key: string,
  vars?: Record<string, string | number>
) => string;

export declare const normalizeUrlForCompare: (url: string) => string;
export declare const urlsMatch: (lockedUrl: string, currentUrl: string) => boolean;
export declare const isGeminiHost: (hostname: string) => boolean;
export declare const validateLockedConversationUrl: (
  url: string,
  t: Translator
) => { ok: true } | { ok: false; message: string };
