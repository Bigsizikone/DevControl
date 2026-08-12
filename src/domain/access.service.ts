import { Injectable } from '@nestjs/common';
import { Grant, Permission, Scope, Ticket, User } from './models';

export type AccessDecision = {
  allowed: boolean;
  reason: string;
  decisionId: string;
};

const DIMENSIONS: Array<[keyof Scope, keyof Ticket]> = [
  ['organizations', 'organizationId'],
  ['departments', 'departmentId'],
  ['territories', 'territoryId'],
  ['categories', 'categoryId'],
  ['ticketTypes', 'typeId'],
  ['ticketKinds', 'kindId'],
  ['supportGroups', 'supportGroupId'],
  ['equipmentIds', 'equipmentId'],
  ['projects', 'projectId'],
];

@Injectable()
export class AccessService {
  private readonly roleGrants = new Map<string, Grant[]>([
    ['initiator', [
      { permission: 'ticket.create', effect: 'allow' },
      { permission: 'ticket.read', effect: 'allow' },
      { permission: 'ticket.update', effect: 'allow' },
      { permission: 'ticket.comment', effect: 'allow' },
      { permission: 'ticket.reopen', effect: 'allow' },
    ]],
    ['observer', [
      { permission: 'ticket.read', effect: 'allow' },
      { permission: 'ticket.comment', effect: 'allow' },
    ]],
    ['assignee', [
      { permission: 'ticket.read', effect: 'allow' },
      { permission: 'ticket.update', effect: 'allow' },
      { permission: 'ticket.comment', effect: 'allow' },
      { permission: 'ticket.assign', effect: 'allow' },
      { permission: 'ticket.close', effect: 'allow' },
    ]],
    ['dispatcher', [
      { permission: 'ticket.read', effect: 'allow' },
      { permission: 'ticket.assign', effect: 'allow' },
      { permission: 'ticket.change_support_group', effect: 'allow' },
      { permission: 'ticket.change_sla', effect: 'allow' },
    ]],
    ['department_manager', [
      { permission: 'ticket.read', effect: 'allow' },
      { permission: 'report.read', effect: 'allow' },
    ]],
    ['admin', [
      { permission: 'ticket.read', effect: 'allow' },
      { permission: 'ticket.create', effect: 'allow' },
      { permission: 'ticket.update', effect: 'allow' },
      { permission: 'ticket.comment', effect: 'allow' },
      { permission: 'ticket.assign', effect: 'allow' },
      { permission: 'ticket.change_support_group', effect: 'allow' },
      { permission: 'ticket.change_sla', effect: 'allow' },
      { permission: 'ticket.close', effect: 'allow' },
      { permission: 'ticket.reopen', effect: 'allow' },
      { permission: 'directory.manage', effect: 'allow' },
      { permission: 'route.manage', effect: 'allow' },
      { permission: 'report.read', effect: 'allow' },
    ]],
  ]);

  check(user: User, permission: Permission, ticket: Ticket): AccessDecision {
    const decisionId = crypto.randomUUID();
    const grants = user.roleCodes.flatMap((role) => this.roleGrants.get(role) ?? []);
    const matching = grants.filter((grant) => grant.permission === permission);

    if (matching.some((grant) => grant.effect === 'deny' && this.scopeMatches(grant.scope, ticket))) {
      return { allowed: false, reason: 'explicit_deny', decisionId };
    }

    if (!matching.some((grant) => grant.effect === 'allow' && this.scopeMatches(grant.scope, ticket))) {
      return { allowed: false, reason: 'permission_missing', decisionId };
    }

    if (permission === 'ticket.read' || permission === 'ticket.update' || permission === 'ticket.comment') {
      const hasSpecificRelation = ticket.createdBy === user.id
        || ticket.observerIds?.includes(user.id)
        || ticket.assigneeId === user.id
        || user.roleCodes.includes('dispatcher')
        || user.roleCodes.includes('admin')
        || (user.roleCodes.includes('department_manager') && user.managedDepartmentIds?.includes(ticket.departmentId ?? '') === true);
      if (!hasSpecificRelation && user.roleCodes.includes('initiator')) {
        return { allowed: false, reason: 'ticket_relation_missing', decisionId };
      }
    }

    return { allowed: true, reason: 'allowed', decisionId };
  }

  private scopeMatches(scope: Scope | undefined, ticket: Ticket): boolean {
    if (!scope) return true;
    return DIMENSIONS.every(([scopeKey, ticketKey]) => {
      const values = scope[scopeKey];
      if (!values || values.length === 0) return true;
      const ticketValue = ticket[ticketKey];
      if (ticketValue === undefined || Array.isArray(ticketValue)) return false;
      return values.includes(String(ticketValue));
    });
  }
}
