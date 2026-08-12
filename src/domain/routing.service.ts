import { Injectable } from '@nestjs/common';
import { AssignmentPolicy, Candidate, RoutingCondition, RoutingRule, SupportGroup, Ticket } from './models';

export type RoutingInput = {
  ticket: Ticket;
  rules: RoutingRule[];
  groups: SupportGroup[];
  candidates: Candidate[];
  requiredCompetencyIds?: string[];
};

export type RoutingResult = {
  matchedRuleIds: string[];
  supportGroupId?: string;
  assigneeId?: string;
  slaPolicyId?: string;
  priority?: number;
  approvalRequired: boolean;
  visitRequired: boolean;
  reasons: string[];
};

@Injectable()
export class RoutingService {
  simulate(input: RoutingInput): RoutingResult {
    const matched = input.rules
      .filter((rule) => rule.conditions.every((condition) => this.conditionMatches(condition, input.ticket)))
      .sort((a, b) => b.priority - a.priority);
    const selected = matched[0];
    const actions = selected?.actions ?? {};
    const group = input.groups.find((item) => item.id === actions.supportGroupId && item.active);
    const reasons = selected ? [`rule:${selected.id}`] : ['no_matching_rule'];

    if (!group) {
      return { matchedRuleIds: matched.map((item) => item.id), ...this.defaults(actions), reasons: [...reasons, 'support_group_not_found'] };
    }

    const candidates = input.candidates.filter((candidate) => candidate.active && group.memberIds.includes(candidate.userId));
    const eligible = candidates.filter((candidate) => this.hasCompetencies(candidate, input.requiredCompetencyIds));
    const assignee = this.selectCandidate(eligible, actions.assignmentPolicy, input.ticket, group);
    if (!assignee) reasons.push('no_eligible_assignee');

    return {
      matchedRuleIds: matched.map((item) => item.id),
      supportGroupId: group.id,
      assigneeId: assignee?.userId,
      ...this.defaults(actions),
      reasons,
    };
  }

  private defaults(actions: RoutingRule['actions']) {
    return {
      slaPolicyId: actions.slaPolicyId,
      priority: actions.priority,
      approvalRequired: actions.approvalRequired ?? false,
      visitRequired: actions.visitRequired ?? false,
    };
  }

  private conditionMatches(condition: RoutingCondition, ticket: Ticket): boolean {
    const actual = this.readField(condition.field, ticket);
    switch (condition.op) {
      case 'exists': return actual !== undefined && actual !== null;
      case 'eq': return actual === condition.value;
      case 'in': return Array.isArray(condition.value) && condition.value.includes(actual as never);
      case 'contains': return typeof actual === 'string' && actual.toLowerCase().includes(String(condition.value).toLowerCase());
      case 'gte': return typeof actual === 'number' && actual >= Number(condition.value);
      case 'lte': return typeof actual === 'number' && actual <= Number(condition.value);
      case 'matches_keyword': return `${ticket.subject ?? ''} ${ticket.description ?? ''}`.toLowerCase().includes(String(condition.value).toLowerCase());
    }
  }

  private readField(field: string, ticket: Ticket): unknown {
    const normalized = field.replace(/^ticket\./, '') as keyof Ticket;
    return ticket[normalized];
  }

  private hasCompetencies(candidate: Candidate, required?: string[]): boolean {
    if (!required || required.length === 0) return true;
    return required.every((competency) => candidate.competencyIds?.includes(competency));
  }

  private selectCandidate(candidates: Candidate[], policy: AssignmentPolicy | undefined, ticket: Ticket, group: SupportGroup): Candidate | undefined {
    if (candidates.length === 0) return undefined;
    const strategies = policy?.strategies ?? ['min_active_load'];
    let result = [...candidates];
    for (const strategy of strategies) {
      if (strategy === 'territory') result = result.filter((item) => item.territoryIds?.includes(ticket.territoryId ?? '') || !group.territoryIds?.length);
      if (strategy === 'organization_affinity') result = result.filter((item) => item.organizationIds?.includes(ticket.organizationId ?? ''));
      if (strategy === 'equipment_affinity') result = result.filter((item) => item.previousEquipmentIds?.includes(ticket.equipmentId ?? ''));
      if (result.length === 0) return undefined;
      if (strategy === 'min_active_load') result.sort((a, b) => a.activeTicketCount - b.activeTicketCount);
    }
    return result[0];
  }
}
