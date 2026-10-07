import type { MigrationInput, ValidationReport } from "../types.js";
import { ScimClient } from "../scim/client.js";
import { EvidenceLogger } from "../evidence/logger.js";

export class MigrationValidator {
  private scim: ScimClient;
  private evidence: EvidenceLogger;

  constructor(scim: ScimClient, evidence: EvidenceLogger) {
    this.scim = scim;
    this.evidence = evidence;
  }

  async validate(input: MigrationInput): Promise<ValidationReport> {
    const report: ValidationReport = {
      valid: true,
      users: [],
      groups: [],
      memberships: [],
      warnings: [],
      errors: [],
    };

    for (const u of input.users) {
      try {
        const start = Date.now();
        const result = await this.scim.getUserByUserName(u.userName);
        this.evidence.log({
          operation: "validate_user",
          method: "GET",
          url: `/Users?filter=userName eq "${u.userName}"`,
          durationMs: Date.now() - start,
          dryRun: true,
          response: result.found ? { id: result.huaweiUserId } : null,
        });

        report.users.push({
          userName: u.userName,
          existsInHuawei: result.found,
          huaweiId: result.huaweiUserId,
        });

        if (!result.found) {
          report.warnings.push(`User ${u.userName} does not exist in Huawei IIC yet - will need to be created`);
        }
      } catch (err: any) {
        report.users.push({ userName: u.userName, existsInHuawei: false });
        report.errors.push(`Failed to validate user ${u.userName}: ${err.message}`);
        report.valid = false;
      }
    }

    const existingGroups = new Map<string, string>();
    try {
      let idx = 1;
      while (true) {
        const start = Date.now();
        const list = await this.scim.listGroups(idx, 100);
        this.evidence.log({
          operation: "validate_list_groups",
          method: "GET",
          url: `/Groups?startIndex=${idx}&count=100`,
          durationMs: Date.now() - start,
          dryRun: true,
          response: { totalResults: list.totalResults, count: list.Resources.length },
        });
        for (const g of list.Resources) {
          if (g.displayName && g.id) existingGroups.set(g.displayName, g.id);
        }
        if (idx + list.itemsPerPage > list.totalResults) break;
        idx += list.itemsPerPage;
      }
    } catch (err: any) {
      report.errors.push(`Failed to list groups for validation: ${err.message}`);
      report.valid = false;
    }

    for (const g of input.groups) {
      const existingId = existingGroups.get(g.displayName);
      report.groups.push({
        displayName: g.displayName,
        existsInHuawei: !!existingId,
        huaweiId: existingId,
      });

      if (!existingId) {
        report.warnings.push(`Group ${g.displayName} does not exist in Huawei IIC yet - will need to be created`);
      }
    }

    const userMap = new Map<string, string>();
    for (const v of report.users) {
      if (v.huaweiId) userMap.set(v.userName, v.huaweiId);
    }

    for (const m of input.memberships || []) {
      const groupId = existingGroups.get(m.groupDisplayName);
      for (const userName of m.memberUserNames) {
        const userId = userMap.get(userName);

        if (!groupId || !userId) {
          report.memberships.push({
            groupDisplayName: m.groupDisplayName,
            memberUserName: userName,
            verified: false,
            reason: !groupId
              ? `Group ${m.groupDisplayName} not found in Huawei IIC`
              : `User ${userName} not found in Huawei IIC`,
          });
          continue;
        }

        try {
          const start = Date.now();
          const members = await this.scim.getGroupMembers(groupId);
          this.evidence.log({
            operation: "validate_group_members",
            method: "GET",
            url: `/Groups/${groupId}`,
            durationMs: Date.now() - start,
            dryRun: true,
            response: { memberCount: members.length },
          });

          const alreadyMember = members.some((mem) => mem.value === userId);
          report.memberships.push({
            groupDisplayName: m.groupDisplayName,
            memberUserName: userName,
            verified: alreadyMember,
            reason: alreadyMember
              ? "Membership already exists in Huawei IIC"
              : "Membership does not exist yet - will need to be added",
          });

          if (alreadyMember) {
            report.warnings.push(`User ${userName} is already a member of group ${m.groupDisplayName} - will be skipped`);
          }
        } catch (err: any) {
          report.memberships.push({
            groupDisplayName: m.groupDisplayName,
            memberUserName: userName,
            verified: false,
            reason: `Could not verify membership: ${err.message}`,
          });
        }
      }
    }

    if (report.errors.length > 0) {
      report.valid = false;
    }

    await this.evidence.flush();
    return report;
  }
}

export function formatValidationReport(report: ValidationReport): string {
  const lines: string[] = [
    `Validation Report`,
    `Status: ${report.valid ? "VALID" : "INVALID"}`,
    ``,
    `Users (${report.users.length}):`,
  ];

  for (const u of report.users) {
    lines.push(
      `  ${u.existsInHuawei ? "EXISTS" : "MISSING"} ${u.userName}${u.huaweiId ? ` (id: ${u.huaweiId})` : ""}`
    );
  }

  lines.push("", `Groups (${report.groups.length}):`);
  for (const g of report.groups) {
    lines.push(
      `  ${g.existsInHuawei ? "EXISTS" : "MISSING"} ${g.displayName}${g.huaweiId ? ` (id: ${g.huaweiId})` : ""}`
    );
  }

  lines.push("", `Memberships (${report.memberships.length}):`);
  for (const m of report.memberships) {
    lines.push(
      `  ${m.verified ? "VERIFIED" : "UNVERIFIED"} ${m.memberUserName} -> ${m.groupDisplayName}${m.reason ? ` (${m.reason})` : ""}`
    );
  }

  if (report.warnings.length > 0) {
    lines.push("", `Warnings (${report.warnings.length}):`);
    for (const w of report.warnings) {
      lines.push(`  - ${w}`);
    }
  }

  if (report.errors.length > 0) {
    lines.push("", `Errors (${report.errors.length}):`);
    for (const e of report.errors) {
      lines.push(`  - ${e}`);
    }
  }

  return lines.join("\n");
}
