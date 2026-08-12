export type RoleCode =
  | 'initiator'
  | 'observer'
  | 'assignee'
  | 'dispatcher'
  | 'department_manager'
  | 'admin';

export type Permission =
  | 'ticket.read'
  | 'ticket.create'
  | 'ticket.update'
  | 'ticket.comment'
  | 'ticket.assign'
  | 'ticket.change_support_group'
  | 'ticket.change_sla'
  | 'ticket.close'
  | 'ticket.reopen'
  | 'report.read'
  | 'directory.manage'
  | 'route.manage';

export type Scope = {
  organizations?: string[];
  departments?: string[];
  territories?: string[];
  categories?: string[];
  ticketTypes?: string[];
  ticketKinds?: string[];
  supportGroups?: string[];
  equipmentIds?: string[];
  projects?: string[];
};

export type Grant = {
  permission: Permission;
  effect: 'allow' | 'deny';
  scope?: Scope;
};

export type Ticket = {
  id: string;
  createdBy: string;
  observerIds?: string[];
  assigneeId?: string;
  supportGroupId?: string;
  organizationId?: string;
  departmentId?: string;
  territoryId?: string;
  categoryId?: string;
  typeId?: string;
  kindId?: string;
  equipmentId?: string;
  projectId?: string;
  priority?: number;
  subject?: string;
  description?: string;
};

export type User = {
  id: string;
  roleCodes: RoleCode[];
  supportGroupIds?: string[];
  managedDepartmentIds?: string[];
};

export type RoutingCondition = {
  field: string;
  op: 'eq' | 'in' | 'contains' | 'gte' | 'lte' | 'matches_keyword' | 'exists';
  value?: string | number | boolean | Array<string | number>;
};

export type RoutingRule = {
  id: string;
  priority: number;
  conditions: RoutingCondition[];
  actions: {
    supportGroupId?: string;
    slaPolicyId?: string;
    priority?: number;
    approvalRequired?: boolean;
    visitRequired?: boolean;
    assignmentPolicy?: AssignmentPolicy;
  };
};

export type SupportGroup = {
  id: string;
  active: boolean;
  memberIds: string[];
  territoryIds?: string[];
  organizationIds?: string[];
  categoryIds?: string[];
};

export type Candidate = {
  userId: string;
  active: boolean;
  competencyIds?: string[];
  territoryIds?: string[];
  organizationIds?: string[];
  activeTicketCount: number;
  previousEquipmentIds?: string[];
};

export type AssignmentPolicy = {
  strategies: Array<
    | 'competency_match'
    | 'territory'
    | 'organization_affinity'
    | 'equipment_affinity'
    | 'min_active_load'
    | 'round_robin'
  >;
};
