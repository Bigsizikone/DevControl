import { AccessService } from '../src/domain/access.service';
import { Ticket, User } from '../src/domain/models';

const ticket: Ticket = { id: 't-1', createdBy: 'u-1', organizationId: 'org-1', categoryId: 'network' };

describe('AccessService', () => {
  const service = new AccessService();

  it('allows initiator to read own ticket', () => {
    const user: User = { id: 'u-1', roleCodes: ['initiator'] };
    expect(service.check(user, 'ticket.read', ticket).allowed).toBe(true);
  });

  it('denies initiator access to another user ticket', () => {
    const user: User = { id: 'u-2', roleCodes: ['initiator'] };
    expect(service.check(user, 'ticket.read', ticket)).toMatchObject({ allowed: false, reason: 'ticket_relation_missing' });
  });

  it('allows dispatcher to read outside initiator relation', () => {
    const user: User = { id: 'u-2', roleCodes: ['dispatcher'] };
    expect(service.check(user, 'ticket.read', ticket).allowed).toBe(true);
  });
});
