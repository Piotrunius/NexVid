export function normalizeFebboxTokenForStorage(
  rawValue?: string | null,
): string {
  const value = String(rawValue || "").trim();
  return value;
}

export function resolveFebboxToken(rawValue?: string | null): string {
  return String(rawValue || "").trim();
}
