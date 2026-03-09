export const PUBLIC_FEBBOX_TOKEN_VALUE = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3NzMwMzgzMjgsIm5iZiI6MTc3MzAzODMyOCwiZXhwIjoxODA0MTQyMzQ4LCJkYXRhIjp7InVpZCI6MTQ5NjI3NSwidG9rZW4iOiI2N2UyZjFlMzY5OTA1NmRkOWU0Y2ZlZGMwNzMzM2E0NCJ9fQ.2BHTRINO_jnRD0z6B2F-PuZj3GCg2nfIYnIO7jGQimA';

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
