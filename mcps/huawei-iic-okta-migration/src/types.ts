export interface ScimUser {
  id?: string;
  userName: string;
  displayName?: string;
  name?: {
    givenName?: string;
    familyName?: string;
    formatted?: string;
  };
  emails?: Array<{ value: string; primary?: boolean; type?: string }>;
  active?: boolean;
  externalId?: string;
  schemas?: string[];
}

export interface ScimGroup {
  id?: string;
  displayName: string;
  members?: Array<{ value: string; display?: string; ref?: string; type?: string }>;
  externalId?: string;
  schemas?: string[];
}

export interface ScimListResponse<T> {
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: T[];
  schemas?: string[];
}

export interface ScimPatchRequest {
  schemas: string[];
  Operations: Array<{
    op: string;
    path?: string;
    value?: unknown;
  }>;
}

export interface MigrationUser {
  userName: string;
  email: string;
  givenName?: string;
  familyName?: string;
  displayName?: string;
  active?: boolean;
  externalId?: string;
  oktaId?: string;
}

export interface MigrationGroup {
  displayName: string;
  members?: string[];
  externalId?: string;
  oktaId?: string;
}

export interface MigrationMembership {
  groupDisplayName: string;
  memberUserNames: string[];
}

export interface MigrationInput {
  migrationId?: string;
  source?: string;
  target?: string;
  users: MigrationUser[];
  groups: MigrationGroup[];
  memberships?: MigrationMembership[];
}

export interface ResolvedUser {
  input: MigrationUser;
  huaweiId?: string;
  existed: boolean;
  status: "pending" | "created" | "resolved" | "skipped" | "failed";
  error?: string;
}

export interface ResolvedGroup {
  input: MigrationGroup;
  huaweiId?: string;
  existed: boolean;
  status: "pending" | "created" | "resolved" | "skipped" | "failed";
  error?: string;
}

export interface ResolvedMembership {
  groupDisplayName: string;
  memberUserName: string;
  huaweiGroupId?: string;
  huaweiUserId?: string;
  status: "pending" | "applied" | "skipped" | "failed";
  error?: string;
}

export interface MigrationRisk {
  level: "low" | "medium" | "high";
  category: string;
  message: string;
}

export interface MigrationBlocker {
  category: string;
  message: string;
}

export interface MigrationPlan {
  id: string;
  createdAt: string;
  migrationId?: string;
  source?: string;
  target?: string;
  usersToCreate: ResolvedUser[];
  usersExisting: ResolvedUser[];
  groupsToCreate: ResolvedGroup[];
  groupsExisting: ResolvedGroup[];
  membershipsToAdd: ResolvedMembership[];
  risks: MigrationRisk[];
  blockers: MigrationBlocker[];
  dryRunSummary: string;
}

export interface MigrationState {
  planId: string;
  migrationId?: string;
  startedAt: string;
  updatedAt: string;
  phase: "planning" | "executing_users" | "executing_groups" | "executing_memberships" | "completed" | "failed";
  dryRun: boolean;
  users: ResolvedUser[];
  groups: ResolvedGroup[];
  memberships: ResolvedMembership[];
  errors: Array<{ phase: string; message: string; timestamp: string }>;
  userMap: Record<string, string>;
  groupMap: Record<string, string>;
}

export interface EvidenceEntry {
  id: string;
  timestamp: string;
  operation: string;
  method: string;
  url: string;
  request?: unknown;
  response?: unknown;
  statusCode?: number;
  durationMs?: number;
  dryRun?: boolean;
  error?: string;
}

export interface ValidationReport {
  valid: boolean;
  migrationId?: string;
  users: Array<{
    userName: string;
    existsInHuawei: boolean;
    huaweiId?: string;
  }>;
  groups: Array<{
    displayName: string;
    existsInHuawei: boolean;
    huaweiId?: string;
  }>;
  memberships: Array<{
    groupDisplayName: string;
    memberUserName: string;
    verified: boolean;
    reason?: string;
  }>;
  warnings: string[];
  errors: string[];
}

export interface GroupFilterSupport {
  supported: boolean;
  checkedAt: string;
  error?: string;
}
