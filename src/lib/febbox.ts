export const PUBLIC_FEBBOX_TOKEN_VALUE =
  process.env.NEXT_PUBLIC_FEBBOX_PUBLIC_TOKEN ||
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3NzI4NjQ4MDksIm5iZiI6MTc3Mjg2NDgwOSwiZXhwIjoxODAzOTY4ODI5LCJkYXRhIjp7InVpZCI6MTQ5MDMyOSwidG9rZW4iOiJjZDhhMTI5NmYyOGI3YWYwMjNlOWZkZjhlOWE3OTFhYyJ9fQ.YPdlVbveJnTtSxKROkd-cm6rDTY3JG86rByR7MQWBmY';

export const PUBLIC_FEBBOX_TOKEN_PLACEHOLDER = '__PUBLIC_FEBBOX_TOKEN__';

export function isPublicFebboxToken(rawValue?: string | null): boolean {
  const value = String(rawValue || '').trim();
  if (!value) return false;
  return value === PUBLIC_FEBBOX_TOKEN_PLACEHOLDER || value === PUBLIC_FEBBOX_TOKEN_VALUE;
}

export function normalizeFebboxTokenForStorage(rawValue?: string | null): string {
  const value = String(rawValue || '').trim();
  if (!value) return '';
  return isPublicFebboxToken(value) ? PUBLIC_FEBBOX_TOKEN_PLACEHOLDER : value;
}

export function resolveFebboxToken(rawValue?: string | null): string {
  const value = String(rawValue || '').trim();
  if (!value) return '';
  return value === PUBLIC_FEBBOX_TOKEN_PLACEHOLDER ? PUBLIC_FEBBOX_TOKEN_VALUE : value;
}
