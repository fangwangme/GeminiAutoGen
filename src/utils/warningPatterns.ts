export const CUSTOM_WARNING_PATTERNS_STORAGE_KEY = "custom_warning_patterns";
export const MAX_CUSTOM_WARNING_PATTERNS = 50;

const REGEX_FLAG_PATTERN = /^[dgimsuvy]*$/;

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseRegexLiteral = (value: string): RegExp | null => {
  if (!value.startsWith("/") || value.length < 2) return null;
  const lastSlash = value.lastIndexOf("/");
  if (lastSlash <= 0) return null;

  const body = value.slice(1, lastSlash);
  const flags = value.slice(lastSlash + 1);

  if (!REGEX_FLAG_PATTERN.test(flags)) {
    throw new Error(`Invalid regex flags: ${flags}`);
  }

  return new RegExp(body, flags);
};

export const normalizeWarningPatternInput = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export const sanitizeCustomWarningPatterns = (
  value: unknown,
  maxPatterns = MAX_CUSTOM_WARNING_PATTERNS
) => {
  if (!Array.isArray(value)) return [];
  const sanitized: string[] = [];

  for (const item of value) {
    const normalized = normalizeWarningPatternInput(item);
    if (!normalized) continue;
    sanitized.push(normalized);
    if (sanitized.length >= maxPatterns) break;
  }

  return sanitized;
};

export const compileWarningPattern = (value: string): RegExp => {
  const normalized = normalizeWarningPatternInput(value);
  if (!normalized) {
    throw new Error("Pattern must not be empty");
  }

  if (normalized.startsWith("/")) {
    const regexLiteral = parseRegexLiteral(normalized);
    if (!regexLiteral) {
      throw new Error("Invalid regex literal. Use /pattern/flags");
    }
    return regexLiteral;
  }

  if (normalized.includes("*")) {
    const wildcardBody = normalized.split("*").map(escapeRegex).join(".*");
    return new RegExp(wildcardBody, "i");
  }

  return new RegExp(escapeRegex(normalized), "i");
};

export const tryCompileWarningPattern = (value: string) => {
  try {
    return {
      regex: compileWarningPattern(value),
      error: null
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      regex: null,
      error: message
    };
  }
};
