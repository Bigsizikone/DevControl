import { RoutingService } from '../src/domain/routing.service';

describe('RoutingService', () => {
  it('selects a matching group and the least loaded competent candidate', () => {
    const result = new RoutingService().simulate({
      ticket: { id: 't-1', createdBy: 'u-1', typeId: 'incident', subject: 'VPN unavailable', territoryId: 'siberia' },
      rules: [{
        id: 'r-network', priority: 100,
        conditions: [{ field: 'ticket.typeId', op: 'eq', value: 'incident' }],
        actions: { supportGroupId: 'network', slaPolicyId: 'p1', assignmentPolicy: { strategies: ['min_active_load'] } },
      }],
      groups: [{ id: 'network', active: true, memberIds: ['u-2', 'u-3'] }],
      candidates: [
        { userId: 'u-2', active: true, competencyIds: ['vpn'], activeTicketCount: 5 },
        { userId: 'u-3', active: true, competencyIds: ['vpn'], activeTicketCount: 2 },
      ],
      requiredCompetencyIds: ['vpn'],
    });

    expect(result).toMatchObject({ supportGroupId: 'network', assigneeId: 'u-3', slaPolicyId: 'p1' });
  });

  it('returns a safe fallback when there is no eligible assignee', () => {
    const result = new RoutingService().simulate({
      ticket: { id: 't-1', createdBy: 'u-1', typeId: 'incident' },
      rules: [{ id: 'r', priority: 1, conditions: [], actions: { supportGroupId: 'g' } }],
      groups: [{ id: 'g', active: true, memberIds: ['u-2'] }],
      candidates: [{ userId: 'u-2', active: true, competencyIds: [], activeTicketCount: 0 }],
      requiredCompetencyIds: ['database'],
    });

    expect(result).toMatchObject({ supportGroupId: 'g', assigneeId: undefined });
    expect(result.reasons).toContain('no_eligible_assignee');
  });
});
