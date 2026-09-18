/**
 * @file string.util.ts
 * @description Single unified string normalization utility adhering strictly to DRY.
 *
 * OVERALL ALGORITHM:
 * 1. Verify input type is a primitive string; return empty string for non-string inputs.
 * 2. Trim surrounding whitespace.
 * 3. Apply optional casing transformation ('lower' or 'upper') if specified, otherwise return trimmed string.
 */

export type StringCaseOption = 'lower' | 'upper' | 'none';

export function normalizeString(value: unknown, casing: StringCaseOption = 'none'): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (casing === 'lower') return trimmed.toLowerCase();
  if (casing === 'upper') return trimmed.toUpperCase();
  return trimmed;
}
