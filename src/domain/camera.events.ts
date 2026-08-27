export type CameraEventName =
  | 'CameraShiftCreated'
  | 'CameraShiftUpdated'
  | 'CameraShiftCancelled'
  | 'CameraViolationCreated'
  | 'CameraViolationUpdated'
  | 'CameraViolationDeleted'
  | 'CameraViolationAttachmentAdded'
  | 'CameraViolationAttachmentDeleted';

export type CameraEvent = {
  name: CameraEventName;
  actorId: string;
  objectId: string;
  occurredAt: string;
  payload?: Record<string, unknown>;
};

/** Нейтральная шина событий без привязки к email, Telegram или другому каналу. */
export class CameraEventBus {
  private readonly listeners = new Set<(event: CameraEvent) => void>();

  subscribe(listener: (event: CameraEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: CameraEvent) {
    for (const listener of this.listeners) listener(event);
  }
}
