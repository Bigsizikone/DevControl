import { ForbiddenException } from '@nestjs/common';
import { CameraEventBus } from '../src/domain/camera.events';
import { CameraService } from '../src/infrastructure/camera.service';

describe('camera module policies', () => {
  const service = new CameraService({} as never, new CameraEventBus());

  it('allows only camera roles and blocks direct API context for other roles', () => {
    expect(() => service.assertRole({ role: 'operator', userId: 'u-1' })).not.toThrow();
    expect(() => service.assertRole({ role: 'senior_operator', userId: 'u-1' })).not.toThrow();
    expect(() => service.assertRole({ role: 'initiator', userId: 'u-1' })).toThrow(ForbiddenException);
  });

  it('validates and preserves overnight shifts as positive duration inputs', () => {
    const shift = (service as any).validateShift({ employeeId: 'u-1', workDate: '2026-08-27', startTime: '20:00', endTime: '08:00' });
    expect(shift.startTime).toBe('20:00');
    expect(shift.endTime).toBe('08:00');
  });

  it('generates weekday and 2x2 recurrence dates', () => {
    const weekdayDates = (service as any).recurrenceDates('2026-08-24', '2026-08-30', 'weekdays', { weekdays: [1, 3, 5] });
    expect(weekdayDates).toEqual(['2026-08-24', '2026-08-26', '2026-08-28']);
    const twoByTwo = (service as any).recurrenceDates('2026-08-24', '2026-08-29', '2x2', {});
    expect(twoByTwo).toEqual(['2026-08-24', '2026-08-25', '2026-08-28', '2026-08-29']);
  });

  it('emits decoupled application events', () => {
    const bus = new CameraEventBus(); const events: string[] = [];
    bus.subscribe((event) => events.push(event.name));
    bus.emit({ name: 'CameraViolationCreated', actorId: 'u-1', objectId: 'v-1', occurredAt: new Date().toISOString() });
    expect(events).toEqual(['CameraViolationCreated']);
  });
});
