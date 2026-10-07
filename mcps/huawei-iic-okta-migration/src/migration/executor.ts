import type {
  MigrationInput,
  MigrationPlan,
  MigrationState,
} from "../types.js";
import { ScimClient } from "../scim/client.js";
import { EvidenceLogger } from "../evidence/logger.js";
import { StateManager } from "./state.js";

export class MigrationExecutor {
  private scim: ScimClient;
  private evidence: EvidenceLogger;
  private stateManager: StateManager;

  constructor(scim: ScimClient, evidence: EvidenceLogger, stateManager: StateManager) {
    this.scim = scim;
    this.evidence = evidence;
    this.stateManager = stateManager;
  }

  private async resolveOrCreateUser(
    state: MigrationState,
    userName: string,
    userData?: {
      displayName?: string;
      givenName?: string;
      familyName?: string;
      email?: string;
      active?: boolean;
      externalId?: string;
    }
  ): Promise<{ huaweiId: string; created: boolean }> {
    const existingId = this.stateManager.getHuaweiUserId(state, userName);
    if (existingId) {
      return { huaweiId: existingId, created: false };
    }

    const start = Date.now();
    const result = await this.scim.getUserByUserName(userName);
    this.evidence.log({
      operation: "resolve_user",
      method: "GET",
      url: `/Users?filter=userName eq "${userName}"`,
      durationMs: Date.now() - start,
      dryRun: state.dryRun,
      response: result.found ? { id: result.huaweiUserId, userName } : null,
    });

    if (result.found && result.huaweiUserId) {
      this.stateManager.updateUserMap(state, userName, result.huaweiUserId);
      return { huaweiId: result.huaweiUserId, created: false };
    }

    if (state.dryRun) {
      const dryId = `[DRY_RUN] would-create-${userName}`;
      this.stateManager.updateUserMap(state, userName, dryId);
      return { huaweiId: dryId, created: true };
    }

    if (!userData) {
      throw new Error(`User ${userName} not found and no creation data provided`);
    }

    const createStart = Date.now();
    const created = await this.scim.createUser({ userName, ...userData });
    this.evidence.log({
      operation: "create_user",
      method: "POST",
      url: "/Users",
      request: { userName },
      response: { id: created.huaweiUserId, userName: created.userName },
      durationMs: Date.now() - createStart,
      dryRun: false,
    });

    this.stateManager.updateUserMap(state, userName, created.huaweiUserId);
    return { huaweiId: created.huaweiUserId, created: true };
  }

  private async resolveOrCreateGroup(
    state: MigrationState,
    displayName: string,
    externalId?: string
  ): Promise<{ huaweiId: string; created: boolean }> {
    const existingId = this.stateManager.getHuaweiGroupId(state, displayName);
    if (existingId) {
      return { huaweiId: existingId, created: false };
    }

    const start = Date.now();
    const filterResult = await this.scim.getGroupByDisplayName(displayName);
    this.evidence.log({
      operation: "resolve_group",
      method: "GET",
      url: `/Groups?filter=displayName eq "${displayName}"`,
      durationMs: Date.now() - start,
      dryRun: state.dryRun,
      response: filterResult.found
        ? { id: filterResult.huaweiGroupId, displayName }
        : { filterSupported: filterResult.filterSupported, error: filterResult.error },
    });

    if (filterResult.found && filterResult.huaweiGroupId) {
      this.stateManager.updateGroupMap(state, displayName, filterResult.huaweiGroupId);
      return { huaweiId: filterResult.huaweiGroupId, created: false };
    }

    if (!filterResult.filterSupported) {
      const allGroups = new Map<string, string>();
      try {
        let idx = 1;
        while (true) {
          const list = await this.scim.listGroups(idx, 100);
          for (const g of list.Resources) {
            if (g.displayName && g.id) allGroups.set(g.displayName, g.id);
          }
          if (idx + list.itemsPerPage > list.totalResults) break;
          idx += list.itemsPerPage;
        }
      } catch (err: any) {
        this.evidence.log({
          operation: "list_groups_fallback",
          method: "GET",
          url: "/Groups",
          error: err.message,
          dryRun: state.dryRun,
        });
      }

      const foundById = allGroups.get(displayName);
      if (foundById) {
        this.stateManager.updateGroupMap(state, displayName, foundById);
        return { huaweiId: foundById, created: false };
      }
    }

    if (state.dryRun) {
      const dryId = `[DRY_RUN] would-create-${displayName}`;
      this.stateManager.updateGroupMap(state, displayName, dryId);
      return { huaweiId: dryId, created: true };
    }

    const createStart = Date.now();
    const created = await this.scim.createGroup(displayName, externalId);
    this.evidence.log({
      operation: "create_group",
      method: "POST",
      url: "/Groups",
      request: { displayName },
      response: { id: created.huaweiGroupId, displayName: created.displayName },
      durationMs: Date.now() - createStart,
      dryRun: false,
    });

    this.stateManager.updateGroupMap(state, displayName, created.huaweiGroupId);
    return { huaweiId: created.huaweiGroupId, created: true };
  }

  async executeUsers(state: MigrationState, input: MigrationInput): Promise<MigrationState> {
    state.phase = "executing_users";

    for (const u of input.users) {
      const existing = state.users.find((ru) => ru.input.userName === u.userName);
      if (existing && (existing.status === "created" || existing.status === "resolved")) continue;

      try {
        const { huaweiId, created } = await this.resolveOrCreateUser(state, u.userName, u);
        const ru: typeof state.users[0] = {
          input: u,
          huaweiId,
          existed: !created,
          status: created ? "created" : "resolved",
        };
        const idx = state.users.findIndex((r) => r.input.userName === u.userName);
        if (idx >= 0) state.users[idx] = ru;
        else state.users.push(ru);
        await this.stateManager.save(state);
      } catch (err: any) {
        const ru: typeof state.users[0] = {
          input: u,
          existed: false,
          status: "failed",
          error: err.message,
        };
        state.users.push(ru);
        this.stateManager.addError(state, "executing_users", err.message);
        await this.stateManager.save(state);
        throw err;
      }
    }

    return state;
  }

  async executeGroups(state: MigrationState, input: MigrationInput): Promise<MigrationState> {
    state.phase = "executing_groups";

    for (const g of input.groups) {
      const existing = state.groups.find((rg) => rg.input.displayName === g.displayName);
      if (existing && (existing.status === "created" || existing.status === "resolved")) continue;

      try {
        const { huaweiId, created } = await this.resolveOrCreateGroup(state, g.displayName, g.externalId);
        const rg: typeof state.groups[0] = {
          input: g,
          huaweiId,
          existed: !created,
          status: created ? "created" : "resolved",
        };
        const idx = state.groups.findIndex((r) => r.input.displayName === g.displayName);
        if (idx >= 0) state.groups[idx] = rg;
        else state.groups.push(rg);
        await this.stateManager.save(state);
      } catch (err: any) {
        const rg: typeof state.groups[0] = {
          input: g,
          existed: false,
          status: "failed",
          error: err.message,
        };
        state.groups.push(rg);
        this.stateManager.addError(state, "executing_groups", err.message);
        await this.stateManager.save(state);
        throw err;
      }
    }

    return state;
  }

  async executeMemberships(state: MigrationState, input: MigrationInput): Promise<MigrationState> {
    state.phase = "executing_memberships";

    const membershipsByGroup = new Map<string, string[]>();
    for (const m of input.memberships || []) {
      const existing = membershipsByGroup.get(m.groupDisplayName) || [];
      for (const userName of m.memberUserNames) {
        if (!existing.includes(userName)) existing.push(userName);
      }
      membershipsByGroup.set(m.groupDisplayName, existing);
    }

    for (const [groupDisplayName, memberUserNames] of membershipsByGroup) {
      const groupId = this.stateManager.getHuaweiGroupId(state, groupDisplayName);
      if (!groupId) {
        const errMsg = `Group not resolved: ${groupDisplayName}. Cannot add members.`;
        for (const userName of memberUserNames) {
          state.memberships.push({
            groupDisplayName,
            memberUserName: userName,
            status: "failed",
            error: errMsg,
          });
        }
        this.stateManager.addError(state, "executing_memberships", errMsg);
        await this.stateManager.save(state);
        throw new Error(errMsg);
      }

      const members: Array<{ userName: string; huaweiUserId: string }> = [];
      const unresolved: string[] = [];

      for (const userName of memberUserNames) {
        const userId = this.stateManager.getHuaweiUserId(state, userName);
        if (!userId) {
          unresolved.push(userName);
          state.memberships.push({
            groupDisplayName,
            memberUserName: userName,
            status: "failed",
            error: `User not resolved: ${userName}`,
          });
        } else if (userId.startsWith("[DRY_RUN]")) {
          state.memberships.push({
            groupDisplayName,
            memberUserName: userName,
            status: "applied",
            huaweiGroupId: groupId,
            huaweiUserId: userId,
          });
        } else {
          members.push({ userName, huaweiUserId: userId });
        }
      }

      if (unresolved.length > 0) {
        const errMsg = `Cannot add members to group ${groupDisplayName}: ${unresolved.length} user(s) lack Huawei SCIM ID: ${unresolved.join(", ")}`;
        this.stateManager.addError(state, "executing_memberships", errMsg);
        await this.stateManager.save(state);
        throw new Error(errMsg);
      }

      if (members.length === 0) continue;

      if (groupId.startsWith("[DRY_RUN]")) {
        for (const m of members) {
          state.memberships.push({
            groupDisplayName,
            memberUserName: m.userName,
            status: "applied",
            huaweiGroupId: groupId,
            huaweiUserId: m.huaweiUserId,
          });
        }
        await this.stateManager.save(state);
        continue;
      }

      if (!state.dryRun) {
        try {
          const start = Date.now();
          const result = await this.scim.addMembersToGroup(groupId, members);
          this.evidence.log({
            operation: "add_group_members",
            method: "PATCH",
            url: `/Groups/${groupId}`,
            request: { members: members.map((m) => m.userName) },
            response: { success: result.success, memberCount: result.memberCount },
            durationMs: Date.now() - start,
            dryRun: false,
          });

          for (const m of members) {
            state.memberships.push({
              groupDisplayName,
              memberUserName: m.userName,
              status: "applied",
              huaweiGroupId: groupId,
              huaweiUserId: m.huaweiUserId,
            });
          }
        } catch (err: any) {
          for (const m of members) {
            state.memberships.push({
              groupDisplayName,
              memberUserName: m.userName,
              status: "failed",
              error: err.message,
            });
          }
          this.stateManager.addError(state, "executing_memberships", err.message);
          await this.stateManager.save(state);
          throw err;
        }
      } else {
        for (const m of members) {
          state.memberships.push({
            groupDisplayName,
            memberUserName: m.userName,
            status: "applied",
            huaweiGroupId: groupId,
            huaweiUserId: m.huaweiUserId,
          });
        }
      }

      await this.stateManager.save(state);
    }

    return state;
  }

  async execute(input: MigrationInput, dryRun: boolean): Promise<MigrationState> {
    const planId = `exec-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    let state = this.stateManager.createInitialState(planId, dryRun);
    await this.stateManager.save(state);

    try {
      state = await this.executeUsers(state, input);
      state = await this.executeGroups(state, input);
      state = await this.executeMemberships(state, input);
      state.phase = "completed";
      await this.stateManager.save(state);
    } catch (err: any) {
      state.phase = "failed";
      await this.stateManager.save(state);
      throw err;
    } finally {
      await this.evidence.flush();
    }

    return state;
  }
}

export function formatExecutionResult(state: MigrationState): string {
  const lines: string[] = [
    `Migration Result: ${state.planId}`,
    `Phase: ${state.phase}`,
    `Mode: ${state.dryRun ? "DRY_RUN" : "LIVE"}`,
    `Started: ${state.startedAt}`,
    `Updated: ${state.updatedAt}`,
    ``,
  ];

  const userStats = {
    created: state.users.filter((u) => u.status === "created").length,
    resolved: state.users.filter((u) => u.status === "resolved" && u.existed).length,
    failed: state.users.filter((u) => u.status === "failed").length,
    pending: state.users.filter((u) => u.status === "pending").length,
  };
  lines.push(
    `Users: ${state.users.length} total`,
    `  Created:  ${userStats.created}`,
    `  Existing: ${userStats.resolved}`,
    `  Failed:   ${userStats.failed}`,
    `  Pending:  ${userStats.pending}`,
    ``
  );

  const groupStats = {
    created: state.groups.filter((g) => g.status === "created").length,
    resolved: state.groups.filter((g) => g.status === "resolved" && g.existed).length,
    failed: state.groups.filter((g) => g.status === "failed").length,
    pending: state.groups.filter((g) => g.status === "pending").length,
  };
  lines.push(
    `Groups: ${state.groups.length} total`,
    `  Created:  ${groupStats.created}`,
    `  Existing: ${groupStats.resolved}`,
    `  Failed:   ${groupStats.failed}`,
    `  Pending:  ${groupStats.pending}`,
    ``
  );

  const memStats = {
    applied: state.memberships.filter((m) => m.status === "applied").length,
    failed: state.memberships.filter((m) => m.status === "failed").length,
    pending: state.memberships.filter((m) => m.status === "pending").length,
  };
  lines.push(
    `Memberships: ${state.memberships.length} total`,
    `  Applied: ${memStats.applied}`,
    `  Failed:  ${memStats.failed}`,
    `  Pending: ${memStats.pending}`,
    ``
  );

  lines.push("Huawei ID Mappings:");
  lines.push("  Users:");
  for (const [k, v] of Object.entries(state.userMap)) {
    lines.push(`    ${k} -> ${v}`);
  }
  lines.push("  Groups:");
  for (const [k, v] of Object.entries(state.groupMap)) {
    lines.push(`    ${k} -> ${v}`);
  }

  if (state.errors.length > 0) {
    lines.push("", "Errors:");
    for (const e of state.errors) {
      lines.push(`  [${e.phase}] ${e.message} (${e.timestamp})`);
    }
  }

  return lines.join("\n");
}
