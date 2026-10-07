import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { ScimClient } from "../scim/client.js";
import { EvidenceLogger } from "../evidence/logger.js";
import { StateManager } from "../migration/state.js";
import { validateInput, createPlan, formatPlan } from "../migration/planner.js";
import { MigrationExecutor, formatExecutionResult } from "../migration/executor.js";
import { MigrationValidator, formatValidationReport } from "../migration/validator.js";
import { readInput } from "../io/parser.js";
import type { MigrationPlan } from "../types.js";

function getEnv(key: string, fallback?: string): string {
  const val = process.env[key] || fallback;
  if (!val) throw new Error(`Missing environment variable: ${key}`);
  return val;
}

function makeScimClient(): ScimClient {
  return new ScimClient(getEnv("HUAWEI_SCIM_BASE_URL"), getEnv("HUAWEI_SCIM_TOKEN"));
}

function makeEvidenceLogger(): EvidenceLogger {
  return new EvidenceLogger(getEnv("MIGRATION_EVIDENCE_DIR", "./evidence"));
}

function makeStateManager(): StateManager {
  return new StateManager(getEnv("MIGRATION_STATE_FILE", "./migration-state.json"));
}

const INPUT_PROPERTIES = {
  inputJson: { type: "string" as const, description: "JSON string with migration input" },
  inputFile: { type: "string" as const, description: "Path to JSON migration input file" },
  users: { type: "array" as const, items: { type: "object" as const }, description: "Users array (inline)" },
  groups: { type: "array" as const, items: { type: "object" as const }, description: "Groups array (inline)" },
  memberships: { type: "array" as const, items: { type: "object" as const }, description: "Memberships array (inline)" },
  usersFile: { type: "string" as const, description: "Path to users CSV file" },
  groupsFile: { type: "string" as const, description: "Path to groups CSV file" },
  membershipsFile: { type: "string" as const, description: "Path to memberships CSV file" },
};

const server = new Server(
  { name: "huawei-iic-okta-migration-agent", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

let lastPlan: MigrationPlan | null = null;

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "scim_get_user_by_username",
      description: "Resolve a user by userName via GET /Users?filter=userName eq ... Returns {found, huaweiUserId, raw}. Read-only.",
      inputSchema: { type: "object", properties: { userName: { type: "string", description: "The userName to look up" } }, required: ["userName"] },
    },
    {
      name: "scim_create_user",
      description: "Create a user via POST /Users. If confirm=false, returns dry-run payload. If confirm=true, creates the user. Will NOT create if user already exists. Returns Huawei SCIM user.id.",
      inputSchema: { type: "object", properties: { confirm: { type: "boolean", description: "Must be true to execute write" }, userName: { type: "string", description: "Required userName" }, email: { type: "string", description: "Required email" }, givenName: { type: "string" }, familyName: { type: "string" }, displayName: { type: "string" }, active: { type: "boolean", description: "Default true" } }, required: ["confirm", "userName", "email"] },
    },
    {
      name: "scim_get_or_create_user",
      description: "Search user by userName. If found, return existing Huawei ID. If not found, create only when confirm=true. Saves result in migration state. Idempotent.",
      inputSchema: { type: "object", properties: { confirm: { type: "boolean", description: "Must be true to create if not found" }, userName: { type: "string" }, email: { type: "string" }, givenName: { type: "string" }, familyName: { type: "string" }, displayName: { type: "string" }, active: { type: "boolean" } }, required: ["confirm", "userName"] },
    },
    {
      name: "scim_create_group",
      description: "Create a group via POST /Groups. Returns Huawei SCIM group.id. Do not use Okta group ID. If confirm=false, returns dry-run payload.",
      inputSchema: { type: "object", properties: { confirm: { type: "boolean", description: "Must be true to execute write" }, displayName: { type: "string", description: "Required group displayName" }, externalId: { type: "string" } }, required: ["confirm", "displayName"] },
    },
    {
      name: "scim_get_group_by_display_name",
      description: "Try GET /Groups?filter=displayName eq ... If Huawei does not support this filter, marks as unsupported. Does not guess group IDs.",
      inputSchema: { type: "object", properties: { displayName: { type: "string", description: "Group displayName to look up" } }, required: ["displayName"] },
    },
    {
      name: "scim_get_or_create_group",
      description: "Check migration state first. Try resolving by displayName if supported. If not found, create group when confirm=true. Stores Huawei group.id in state.",
      inputSchema: { type: "object", properties: { confirm: { type: "boolean", description: "Must be true to create if not found" }, displayName: { type: "string" }, externalId: { type: "string" } }, required: ["confirm", "displayName"] },
    },
    {
      name: "scim_add_members_to_group",
      description: "PATCH /Groups/{huaweiGroupId} to add members. members.value MUST be Huawei SCIM user.id - never Okta user ID, never email. If any member lacks Huawei ID, stops before PATCH.",
      inputSchema: { type: "object", properties: { confirm: { type: "boolean", description: "Must be true to execute write" }, huaweiGroupId: { type: "string", description: "Huawei SCIM group ID" }, members: { type: "array", items: { type: "object", properties: { userName: { type: "string", description: "User display name for reference" }, huaweiUserId: { type: "string", description: "Huawei SCIM user ID (required)" } }, required: ["userName", "huaweiUserId"] }, description: "Array of {userName, huaweiUserId}. Each member MUST have a Huawei SCIM user.id." } }, required: ["confirm", "huaweiGroupId", "members"] },
    },
    {
      name: "migration_plan",
      description: "Create a migration plan. Queries Huawei IIC to classify existing vs to-create. Returns users_to_create, users_existing, groups_to_create, groups_existing, memberships_to_add, risks, blockers, dry_run_summary. Accepts JSON or CSV input.",
      inputSchema: { type: "object", properties: INPUT_PROPERTIES },
    },
    {
      name: "migration_execute",
      description: "Execute migration. If confirm=false, only plan (DRY_RUN). If confirm=true: 1) resolve/create users, 2) resolve/create groups, 3) add memberships using Huawei IDs, 4) save checkpoint after each step, 5) stop on first critical failure, 6) generate evidence report.",
      inputSchema: { type: "object", properties: { confirm: { type: "boolean", description: "Must be true for LIVE mode. Default is DRY_RUN." }, ...INPUT_PROPERTIES } },
    },
    {
      name: "migration_validate",
      description: "Validate migration input against Huawei IIC. Verify users exist, groups exist, memberships exist if SCIM exposes membership details. Produce validation report.",
      inputSchema: { type: "object", properties: INPUT_PROPERTIES },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = args || {};

  try {
    switch (name) {
      case "scim_get_user_by_username": {
        const scim = makeScimClient();
        const evidence = makeEvidenceLogger();
        await evidence.init();
        const start = Date.now();
        const result = await scim.getUserByUserName(a.userName as string);
        evidence.log({ operation: "get_user_by_username", method: "GET", url: `/Users?filter=userName eq "${a.userName}"`, durationMs: Date.now() - start, dryRun: true, response: result.found ? { id: result.huaweiUserId } : null });
        await evidence.flush();
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "scim_create_user": {
        const scim = makeScimClient();
        const evidence = makeEvidenceLogger();
        await evidence.init();
        const start = Date.now();
        const existing = await scim.getUserByUserName(a.userName as string);
        evidence.log({ operation: "resolve_before_create_user", method: "GET", url: `/Users?filter=userName eq "${a.userName}"`, durationMs: Date.now() - start, dryRun: !a.confirm, response: existing.found ? { id: existing.huaweiUserId } : null });
        if (existing.found) {
          await evidence.flush();
          return { content: [{ type: "text", text: JSON.stringify({ action: "skipped", reason: "User already exists", found: true, huaweiUserId: existing.huaweiUserId, userName: a.userName }, null, 2) }] };
        }
        if (!a.confirm) {
          const payload = await scim.buildDryRunCreateUserPayload({ userName: a.userName as string, displayName: a.displayName as string, givenName: a.givenName as string, familyName: a.familyName as string, email: a.email as string, active: a.active as boolean });
          await evidence.flush();
          return { content: [{ type: "text", text: JSON.stringify({ action: "dry_run", wouldCreate: true, payload }, null, 2) }] };
        }
        const createStart = Date.now();
        const created = await scim.createUser({ userName: a.userName as string, displayName: a.displayName as string, givenName: a.givenName as string, familyName: a.familyName as string, email: a.email as string, active: a.active as boolean });
        evidence.log({ operation: "create_user", method: "POST", url: "/Users", request: { userName: a.userName }, response: { id: created.huaweiUserId, userName: created.userName }, durationMs: Date.now() - createStart, dryRun: false });
        await evidence.flush();
        return { content: [{ type: "text", text: JSON.stringify({ action: "created", huaweiUserId: created.huaweiUserId, userName: created.userName }, null, 2) }] };
      }

      case "scim_get_or_create_user": {
        const scim = makeScimClient();
        const evidence = makeEvidenceLogger();
        const stateManager = makeStateManager();
        await evidence.init();
        let state = await stateManager.load();
        if (!state) state = stateManager.createInitialState("ad-hoc", true);
        const start = Date.now();
        const existing = await scim.getUserByUserName(a.userName as string);
        evidence.log({ operation: "get_or_create_user_resolve", method: "GET", url: `/Users?filter=userName eq "${a.userName}"`, durationMs: Date.now() - start, dryRun: !a.confirm, response: existing.found ? { id: existing.huaweiUserId } : null });
        if (existing.found) {
          stateManager.updateUserMap(state, a.userName as string, existing.huaweiUserId!);
          await stateManager.save(state);
          await evidence.flush();
          return { content: [{ type: "text", text: JSON.stringify({ action: "resolved", found: true, huaweiUserId: existing.huaweiUserId, userName: a.userName }, null, 2) }] };
        }
        if (!a.confirm) {
          await evidence.flush();
          return { content: [{ type: "text", text: JSON.stringify({ action: "dry_run", found: false, wouldCreate: true, userName: a.userName }, null, 2) }] };
        }
        const createStart = Date.now();
        const created = await scim.createUser({ userName: a.userName as string, displayName: a.displayName as string, givenName: a.givenName as string, familyName: a.familyName as string, email: a.email as string, active: a.active as boolean });
        evidence.log({ operation: "get_or_create_user_create", method: "POST", url: "/Users", request: { userName: a.userName }, response: { id: created.huaweiUserId, userName: created.userName }, durationMs: Date.now() - createStart, dryRun: false });
        stateManager.updateUserMap(state, a.userName as string, created.huaweiUserId);
        await stateManager.save(state);
        await evidence.flush();
        return { content: [{ type: "text", text: JSON.stringify({ action: "created", found: false, huaweiUserId: created.huaweiUserId, userName: created.userName }, null, 2) }] };
      }

      case "scim_create_group": {
        const scim = makeScimClient();
        const evidence = makeEvidenceLogger();
        await evidence.init();
        if (!a.confirm) {
          await evidence.flush();
          return { content: [{ type: "text", text: JSON.stringify({ action: "dry_run", wouldCreate: true, payload: { schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"], displayName: a.displayName } }, null, 2) }] };
        }
        const start = Date.now();
        const created = await scim.createGroup(a.displayName as string, a.externalId as string);
        evidence.log({ operation: "create_group", method: "POST", url: "/Groups", request: { displayName: a.displayName }, response: { id: created.huaweiGroupId, displayName: created.displayName }, durationMs: Date.now() - start, dryRun: false });
        await evidence.flush();
        return { content: [{ type: "text", text: JSON.stringify({ action: "created", huaweiGroupId: created.huaweiGroupId, displayName: created.displayName }, null, 2) }] };
      }

      case "scim_get_group_by_display_name": {
        const scim = makeScimClient();
        const evidence = makeEvidenceLogger();
        await evidence.init();
        const start = Date.now();
        const result = await scim.getGroupByDisplayName(a.displayName as string);
        evidence.log({ operation: "get_group_by_display_name", method: "GET", url: `/Groups?filter=displayName eq "${a.displayName}"`, durationMs: Date.now() - start, dryRun: true, response: { found: result.found, filterSupported: result.filterSupported, error: result.error } });
        await evidence.flush();
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "scim_get_or_create_group": {
        const scim = makeScimClient();
        const evidence = makeEvidenceLogger();
        const stateManager = makeStateManager();
        await evidence.init();
        let state = await stateManager.load();
        if (!state) state = stateManager.createInitialState("ad-hoc", true);
        const existingId = stateManager.getHuaweiGroupId(state, a.displayName as string);
        if (existingId) {
          await evidence.flush();
          return { content: [{ type: "text", text: JSON.stringify({ action: "resolved_from_state", found: true, huaweiGroupId: existingId, displayName: a.displayName }, null, 2) }] };
        }
        const start = Date.now();
        const filterResult = await scim.getGroupByDisplayName(a.displayName as string);
        evidence.log({ operation: "get_or_create_group_resolve", method: "GET", url: `/Groups?filter=displayName eq "${a.displayName}"`, durationMs: Date.now() - start, dryRun: !a.confirm, response: { found: filterResult.found, filterSupported: filterResult.filterSupported } });
        if (filterResult.found && filterResult.huaweiGroupId) {
          stateManager.updateGroupMap(state, a.displayName as string, filterResult.huaweiGroupId);
          await stateManager.save(state);
          await evidence.flush();
          return { content: [{ type: "text", text: JSON.stringify({ action: "resolved", found: true, huaweiGroupId: filterResult.huaweiGroupId, displayName: a.displayName }, null, 2) }] };
        }
        if (!filterResult.filterSupported && !filterResult.found) {
          const allGroups = new Map<string, string>();
          try {
            let idx = 1;
            while (true) {
              const list = await scim.listGroups(idx, 100);
              for (const g of list.Resources) { if (g.displayName && g.id) allGroups.set(g.displayName, g.id); }
              if (idx + list.itemsPerPage > list.totalResults) break;
              idx += list.itemsPerPage;
            }
          } catch {}
          const foundById = allGroups.get(a.displayName as string);
          if (foundById) {
            stateManager.updateGroupMap(state, a.displayName as string, foundById);
            await stateManager.save(state);
            await evidence.flush();
            return { content: [{ type: "text", text: JSON.stringify({ action: "resolved_via_list", found: true, huaweiGroupId: foundById, displayName: a.displayName, note: "displayName filter unsupported; resolved by listing all groups" }, null, 2) }] };
          }
        }
        if (!a.confirm) {
          await evidence.flush();
          return { content: [{ type: "text", text: JSON.stringify({ action: "dry_run", found: false, wouldCreate: true, displayName: a.displayName, filterSupported: filterResult.filterSupported }, null, 2) }] };
        }
        const createStart = Date.now();
        const created = await scim.createGroup(a.displayName as string, a.externalId as string);
        evidence.log({ operation: "get_or_create_group_create", method: "POST", url: "/Groups", request: { displayName: a.displayName }, response: { id: created.huaweiGroupId, displayName: created.displayName }, durationMs: Date.now() - createStart, dryRun: false });
        stateManager.updateGroupMap(state, a.displayName as string, created.huaweiGroupId);
        await stateManager.save(state);
        await evidence.flush();
        return { content: [{ type: "text", text: JSON.stringify({ action: "created", found: false, huaweiGroupId: created.huaweiGroupId, displayName: created.displayName }, null, 2) }] };
      }

      case "scim_add_members_to_group": {
        const members = (a.members as Array<{ userName: string; huaweiUserId: string }>) || [];
        const unresolved = members.filter((m) => !m.huaweiUserId);
        if (unresolved.length > 0) {
          return { content: [{ type: "text", text: JSON.stringify({ action: "aborted", reason: `${unresolved.length} member(s) lack Huawei SCIM user.id. Never use Okta user ID or email as member.value.`, unresolvedMembers: unresolved.map((m) => m.userName) }, null, 2) }], isError: true };
        }
        if (!a.confirm) {
          const patchPayload = { schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"], Operations: [{ op: "Add", path: "members", value: members.map((m) => ({ value: m.huaweiUserId, display: m.userName })) }] };
          return { content: [{ type: "text", text: JSON.stringify({ action: "dry_run", wouldPatch: true, huaweiGroupId: a.huaweiGroupId, memberCount: members.length, patchPayload }, null, 2) }] };
        }
        const scim = makeScimClient();
        const evidence = makeEvidenceLogger();
        await evidence.init();
        const start = Date.now();
        const result = await scim.addMembersToGroup(a.huaweiGroupId as string, members);
        evidence.log({ operation: "add_members_to_group", method: "PATCH", url: `/Groups/${a.huaweiGroupId}`, request: { members: members.map((m) => m.userName) }, response: { success: result.success, memberCount: result.memberCount }, durationMs: Date.now() - start, dryRun: false });
        await evidence.flush();
        return { content: [{ type: "text", text: JSON.stringify({ action: "applied", huaweiGroupId: a.huaweiGroupId, memberCount: result.memberCount, members: members.map((m) => ({ userName: m.userName, huaweiUserId: m.huaweiUserId })) }, null, 2) }] };
      }

      case "migration_plan": {
        const input = await readInput(a as Record<string, unknown>);
        const { errors: validationErrors, warnings } = validateInput(input);
        if (validationErrors.length > 0) {
          return { content: [{ type: "text", text: JSON.stringify({ valid: false, migrationId: input.migrationId, errors: validationErrors, warnings }, null, 2) }], isError: true };
        }
        const scim = makeScimClient();
        const evidence = makeEvidenceLogger();
        await evidence.init();
        const existingUserNames = new Set<string>();
        try { let idx = 1; while (true) { const list = await scim.listUsers(idx, 100); for (const u of list.Resources) { if (u.userName) existingUserNames.add(u.userName); } if (idx + list.itemsPerPage > list.totalResults) break; idx += list.itemsPerPage; } } catch {}
        const existingGroupNames = new Set<string>();
        try { let idx = 1; while (true) { const list = await scim.listGroups(idx, 100); for (const g of list.Resources) { if (g.displayName) existingGroupNames.add(g.displayName); } if (idx + list.itemsPerPage > list.totalResults) break; idx += list.itemsPerPage; } } catch {}
        const plan = createPlan(input, existingUserNames, existingGroupNames);
        lastPlan = plan;
        await evidence.flush();
        return { content: [{ type: "text", text: formatPlan(plan) }] };
      }

      case "migration_execute": {
        const input = await readInput(a as Record<string, unknown>);
        const { errors: validationErrors } = validateInput(input);
        if (validationErrors.length > 0) {
          return { content: [{ type: "text", text: `Validation errors:\n${validationErrors.map((e) => `  - ${e}`).join("\n")}` }], isError: true };
        }
        const dryRun = !a.confirm;
        const scim = makeScimClient();
        const evidence = makeEvidenceLogger();
        await evidence.init();
        const stateManager = makeStateManager();
        const executor = new MigrationExecutor(scim, evidence, stateManager);
        const result = await executor.execute(input, dryRun);
        return { content: [{ type: "text", text: formatExecutionResult(result) }] };
      }

      case "migration_validate": {
        const input = await readInput(a as Record<string, unknown>);
        const scim = makeScimClient();
        const evidence = makeEvidenceLogger();
        await evidence.init();
        const validator = new MigrationValidator(scim, evidence);
        const report = await validator.validate(input);
        return { content: [{ type: "text", text: formatValidationReport(report) }] };
      }

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err: any) {
    return { content: [{ type: "text", text: `ERROR: ${err.message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
