export const DEFAULT_SITE_NAME = "ternssh";
export const SITE_NAME_MAX_LENGTH = 64;

export function normalizeSiteName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_SITE_NAME;
  return trimmed.slice(0, SITE_NAME_MAX_LENGTH);
}

export function resolveSiteName(stored: string | null | undefined): string {
  if (!stored) return DEFAULT_SITE_NAME;
  return normalizeSiteName(stored);
}
