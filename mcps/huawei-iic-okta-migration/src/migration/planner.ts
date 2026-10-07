import crypto from "node:crypto";
import type {
  MigrationInput,
  MigrationPlan,
  MigrationRisk,
  MigrationBlocker,
  MigrationUser,
  MigrationGroup,
  MigrationMembership,
  ResolvedUser,
  ResolvedGroup,
  ResolvedMembership,
} from "../types.js";

const OKTA_ID_PATTERN = /^00[ugrp][0-9a-zA-Z]{5,}$/;

function looksLikeOktaId(value: string): boolean {
  return OKTA_ID_PATTERN.test(value);
}

export function normalizeInput(input: MigrationInput): {
  users: MigrationUser[];
  groups: MigrationGroup[];
  memberships: MigrationMembership[];
} {
  const users = input.users || [];
  const groups = input.groups || [];
  const explicitMemberships = input.memberships || [];

  const membershipsFromGroups: MigrationMembership[] = [];
  for (const g of groups) {
    if (g.members && g.members.length > 0) {
      membershipsFromGroups.push({
        groupDisplayName: g.displayName,
        memberUserNames: g.members,
      });
    }
  }

  const groupMembershipMap = new Map<string, Set<string>>();
  const allMemberships = [...explicitMemberships, ...membershipsFromGroups];
  for (const m of allMemberships) {
    const existing = groupMembershipMap.get(m.groupDisplayName) || new Set<string>();
    for (const u of m.memberUserNames) {
      existing.add(u);
    }
    groupMembershipMap.set(m.groupDisplayName, existing);
  }

  const memberships: MigrationMembership[] = [];
  for (const [groupDisplayName, memberUserNames] of groupMembershipMap) {
    memberships.push({
      groupDisplayName,
      memberUserNames: Array.from(memberUserNames),
    });
  }

  return { users, groups, memberships };
}

export function generatePlanId(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
  const rand = crypto.randomBytes(4).toString("hex");
  return `plan-${ts}-${rand}`;
}

export function validateInput(input: MigrationInput): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!input.users || !Array.isArray(input.users)) {
    errors.push("input.users must be an array");
    return { errors, warnings };
  }

  if (!input.groups || !Array.isArray(input.groups)) {
    errors.push("input.groups must be an array");
    return { errors, warnings };
  }

  const seenUserNames = new Set<string>();
  for (let i = 0; i < input.users.length; i++) {
    const u = input.users[i];
    const prefix = `users[${i}]`;

    if (!u.userName) {
      errors.push(`${prefix}: userName is mandatory but missing`);
      continue;
    }

    if (seenUserNames.has(u.userName)) {
      errors.push(`${prefix}: duplicate userName "${u.userName}"`);
    }
    seenUserNames.add(u.userName);

    if (!u.email) {
      errors.push(`${prefix}: email is mandatory but missing for user "${u.userName}"`);
    }

    if (!u.givenName && !u.familyName && !u.displayName) {
      errors.push(`${prefix}: no name fields provided for user "${u.userName}". givenName, familyName, or displayName is required. Do not infer missing names silently.`);
    }

    if (u.oktaId) {
      warnings.push(`${prefix}: user "${u.userName}" has oktaId="${u.oktaId}". This is for traceability only and must never be used as a Huawei SCIM ID.`);
    }

    if (u.externalId && looksLikeOktaId(u.externalId)) {
      errors.push(`${prefix}: user "${u.userName}" has externalId="${u.externalId}" which looks like an Okta internal ID. Okta IDs must not be used as Huawei target IDs. Use the oktaId field for traceability instead.`);
    }
  }

  const seenGroupNames = new Set<string>();
  for (let i = 0; i < input.groups.length; i++) {
    const g = input.groups[i];
    const prefix = `groups[${i}]`;

    if (!g.displayName) {
      errors.push(`${prefix}: displayName is mandatory but missing for group`);
      continue;
    }

    if (seenGroupNames.has(g.displayName)) {
      errors.push(`${prefix}: duplicate group displayName "${g.displayName}"`);
    }
    seenGroupNames.add(g.displayName);

    if (g.oktaId) {
      warnings.push(`${prefix}: group "${g.displayName}" has oktaId="${g.oktaId}". For traceability only - never use as Huawei SCIM ID.`);
    }

    if (g.externalId && looksLikeOktaId(g.externalId)) {
      errors.push(`${prefix}: group "${g.displayName}" has externalId="${g.externalId}" which looks like an Okta internal ID. Use the oktaId field for traceability instead.`);
    }

    if (g.members) {
      for (const memberRef of g.members) {
        if (looksLikeOktaId(memberRef)) {
          errors.push(`${prefix}: group "${g.displayName}" has member "${memberRef}" which looks like an Okta ID. Members must reference userName, not Okta internal IDs.`);
        }
      }
    }
  }

  const normalized = normalizeInput(input);
  const groupNames = new Set(input.groups.map((g) => g.displayName));

  for (let i = 0; i < normalized.memberships.length; i++) {
    const m = normalized.memberships[i];
    const prefix = `memberships[${i}]`;

    if (!groupNames.has(m.groupDisplayName)) {
      errors.push(`${prefix}: references unknown group "${m.groupDisplayName}"`);
    }

    for (const userName of m.memberUserNames) {
      if (!seenUserNames.has(userName)) {
        errors.push(`${prefix}: references unknown user "${userName}" in group "${m.groupDisplayName}". Every membership must reference an existing userName in the users list.`);
      }
      if (looksLikeOktaId(userName)) {
        errors.push(`${prefix}: member "${userName}" in group "${m.groupDisplayName}" looks like an Okta ID. Use userName (email) instead.`);
      }
    }
  }

  return { errors, warnings };
}

export function createPlan(
  input: MigrationInput,
  existingUserNames: Set<string>,
  existingGroupNames: Set<string>
): MigrationPlan {
  const normalized = normalizeInput(input);

  const usersToCreate: ResolvedUser[] = [];
  const usersExisting: ResolvedUser[] = [];
  const groupsToCreate: ResolvedGroup[] = [];
  const groupsExisting: ResolvedGroup[] = [];
  const membershipsToAdd: ResolvedMembership[] = [];
  const risks: MigrationRisk[] = [];
  const blockers: MigrationBlocker[] = [];

  for (const u of normalized.users) {
    const ru: ResolvedUser = { input: u, existed: false, status: "pending" };
    if (existingUserNames.has(u.userName)) {
      ru.existed = true;
      ru.status = "resolved";
      usersExisting.push(ru);
    } else {
      usersToCreate.push(ru);
    }
  }

  for (const g of normalized.groups) {
    const rg: ResolvedGroup = { input: g, existed: false, status: "pending" };
    if (existingGroupNames.has(g.displayName)) {
      rg.existed = true;
      rg.status = "resolved";
      groupsExisting.push(rg);
    } else {
      groupsToCreate.push(rg);
    }
  }

  for (const m of normalized.memberships) {
    for (const userName of m.memberUserNames) {
      membershipsToAdd.push({
        groupDisplayName: m.groupDisplayName,
        memberUserName: userName,
        status: "pending",
      });
    }
  }

  if (usersToCreate.length > 0) {
    risks.push({
      level: "medium",
      category: "user_creation",
      message: `${usersToCreate.length} user(s) will be created in Huawei IIC. This is irreversible without manual deletion.`,
    });
  }

  if (groupsToCreate.length > 0) {
    risks.push({
      level: "medium",
      category: "group_creation",
      message: `${groupsToCreate.length} group(s) will be created in Huawei IIC.`,
    });
  }

  if (membershipsToAdd.length > 50) {
    risks.push({
      level: "high",
      category: "membership_volume",
      message: `${membershipsToAdd.length} membership(s) to add. Large volumes may hit rate limits.`,
    });
  }

  for (const u of normalized.users) {
    if (u.oktaId) {
      risks.push({
        level: "low",
        category: "okta_id_traceability",
        message: `User ${u.userName} has oktaId="${u.oktaId}". For traceability only - must never be used as Huawei SCIM ID.`,
      });
    }
  }

  for (const g of normalized.groups) {
    if (g.oktaId) {
      risks.push({
        level: "low",
        category: "okta_id_traceability",
        message: `Group ${g.displayName} has oktaId="${g.oktaId}". For traceability only - must never be used as Huawei SCIM ID.`,
      });
    }
  }

  if (usersToCreate.length === 0 && groupsToCreate.length === 0 && membershipsToAdd.length === 0) {
    blockers.push({
      category: "no_op",
      message: "All users and groups already exist, and no memberships to add. Migration is a no-op.",
    });
  }

  const lines: string[] = [
    `DRY RUN SUMMARY`,
    `===============`,
    `Migration ID: ${input.migrationId || "N/A"}`,
    `Source: ${input.source || "okta"} -> Target: ${input.target || "huawei-iam-identity-center"}`,
    ``,
    `Users to create:    ${usersToCreate.length}`,
    `Users existing:     ${usersExisting.length}`,
    `Groups to create:   ${groupsToCreate.length}`,
    `Groups existing:    ${groupsExisting.length}`,
    `Memberships to add: ${membershipsToAdd.length}`,
    ``,
    `Risks: ${risks.length}`,
  ];
  for (const r of risks) {
    lines.push(`  [${r.level}] ${r.category}: ${r.message}`);
  }
  if (blockers.length > 0) {
    lines.push("", `Blockers: ${blockers.length}`);
    for (const b of blockers) {
      lines.push(`  [${b.category}] ${b.message}`);
    }
  }

  return {
    id: generatePlanId(),
    createdAt: new Date().toISOString(),
    migrationId: input.migrationId,
    source: input.source,
    target: input.target,
    usersToCreate,
    usersExisting,
    groupsToCreate,
    groupsExisting,
    membershipsToAdd,
    risks,
    blockers,
    dryRunSummary: lines.join("\n"),
  };
}

export function formatPlan(plan: MigrationPlan): string {
  const lines: string[] = [
    `Migration Plan: ${plan.id}`,
    `Migration ID: ${plan.migrationId || "N/A"}`,
    `Source: ${plan.source || "okta"} -> Target: ${plan.target || "huawei-iam-identity-center"}`,
    `Created: ${plan.createdAt}`,
    ``,
    plan.dryRunSummary,
    ``,
    `Users to create:`,
  ];
  for (const u of plan.usersToCreate) {
    lines.push(`  + ${u.input.userName} (${u.input.email})`);
  }
  lines.push("", "Users already existing:");
  for (const u of plan.usersExisting) {
    lines.push(`  = ${u.input.userName} (${u.input.email})`);
  }
  lines.push("", "Groups to create:");
  for (const g of plan.groupsToCreate) {
    lines.push(`  + ${g.input.displayName}`);
  }
  lines.push("", "Groups already existing:");
  for (const g of plan.groupsExisting) {
    lines.push(`  = ${g.input.displayName}`);
  }
  lines.push("", "Memberships to add:");
  for (const m of plan.membershipsToAdd) {
    lines.push(`  + ${m.memberUserName} -> ${m.groupDisplayName}`);
  }
  return lines.join("\n");
}
