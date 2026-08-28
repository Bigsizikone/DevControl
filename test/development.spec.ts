import { DEVELOPMENT_STATUS_CODES, parseNonNegativeHours, validateDevelopmentDates } from '../src/infrastructure/development.rules';

describe('Development rules', () => {
  it('uses Backlog as the first server-side status', () => {
    expect(DEVELOPMENT_STATUS_CODES[0]).toBe('backlog');
    expect(DEVELOPMENT_STATUS_CODES).toContain('closed');
  });

  it('accepts fractional non-negative hours and rejects invalid values', () => {
    expect(parseNonNegativeHours('24.5', 'Часы')).toBe(24.5);
    expect(() => parseNonNegativeHours(-1, 'Часы')).toThrow('неотрицательным');
    expect(() => parseNonNegativeHours(Number.NaN, 'Часы')).toThrow('неотрицательным');
    expect(() => parseNonNegativeHours(Number.POSITIVE_INFINITY, 'Часы')).toThrow('неотрицательным');
  });

  it('rejects a release date earlier than the development start', () => {
    expect(() => validateDevelopmentDates('2026-09-15', '2026-09-14')).toThrow('Дата релиза не может быть раньше');
    expect(() => validateDevelopmentDates('2026-09-15', '2026-09-15')).not.toThrow();
  });
});
