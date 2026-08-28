import { BadRequestException } from '@nestjs/common';

export const DEVELOPMENT_STATUS_CODES = [
  'backlog', 'analytics', 'ready_for_development', 'development',
  'testing', 'ready_for_release', 'release', 'closed',
] as const;

export type DevelopmentStatusCode = typeof DEVELOPMENT_STATUS_CODES[number];

export function parseNonNegativeHours(value: unknown, label: string): number {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new BadRequestException(`${label} должно быть неотрицательным числом`);
  return Math.round(parsed * 100) / 100;
}

export function validateDevelopmentDates(start: unknown, release: unknown) {
  const startDate = start ? String(start) : '';
  const releaseDate = release ? String(release) : '';
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new BadRequestException('Некорректная дата начала разработки');
  if (releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) throw new BadRequestException('Некорректная дата релиза');
  if (startDate && releaseDate && releaseDate < startDate) throw new BadRequestException('Дата релиза не может быть раньше даты начала разработки.');
}
