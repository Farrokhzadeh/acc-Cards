const SENSITIVE_ASSIGNMENT = /\b(authorization|api[-_]?key|token|secret|password|passwd|cvv|cvc|pan)\b(\s*[:=]\s*)([^\s,;}&]+)/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const CARD_LIKE = /\b(?:\d[ -]*?){13,19}\b/g;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export function redactSensitiveText(value: unknown, maxLength = 500) {
  const text = value instanceof Error ? `${value.name}: ${value.message}` : String(value);
  return text
    .replace(BEARER, "Bearer [redacted]")
    .replace(SENSITIVE_ASSIGNMENT, "$1$2[redacted]")
    .replace(CARD_LIKE, "[card-data-redacted]")
    .replace(EMAIL, "[email-redacted]")
    .slice(0, maxLength);
}
