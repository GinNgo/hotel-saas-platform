import enMessages from '../../../assets/i18n/en.json';
import viMessages from '../../../assets/i18n/vi.json';

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [prefix];

  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key));
}

function emptyStringKeys(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') return value.trim() ? [] : [prefix];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [];

  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => emptyStringKeys(child, prefix ? `${prefix}.${key}` : key));
}

describe('public translation catalog', () => {
  it('keeps Vietnamese and English keys in parity', () => {
    expect(flattenKeys(enMessages).sort()).toEqual(flattenKeys(viMessages).sort());
  });

  it('does not ship empty translation values', () => {
    expect(emptyStringKeys(viMessages)).toEqual([]);
    expect(emptyStringKeys(enMessages)).toEqual([]);
  });
});
