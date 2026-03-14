export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function formatTime(tsISO: string, locale = "ko-KR") {
  const date = new Date(tsISO);
  return date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function uid(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function formatCurrency(value: number, currency = "KRW", locale = "ko-KR") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "KRW" ? 0 : 2
  }).format(value);
}

export function formatNumber(value: number, maximumFractionDigits = 0, locale = "ko-KR") {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits
  }).format(value);
}

export function formatSignedNumber(value: number, maximumFractionDigits = 0, locale = "ko-KR") {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, maximumFractionDigits, locale)}`;
}

export function formatSignedPercent(value: number, maximumFractionDigits = 2) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(maximumFractionDigits)}%`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
