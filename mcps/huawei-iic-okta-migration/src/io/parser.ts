import fs from "node:fs/promises";
import type { MigrationInput, MigrationUser, MigrationGroup, MigrationMembership } from "../types.js";

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCsv(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  if (lines.length < 2) return [];
  return lines.slice(1).map(parseCsvLine);
}

export function parseUsersCsv(text: string): MigrationUser[] {
  const rows = parseCsv(text);
  return rows.map((cols) => ({
    userName: cols[0] || "",
    email: cols[1] || "",
    givenName: cols[2] || undefined,
    familyName: cols[3] || undefined,
    displayName: cols[4] || undefined,
    active: cols[5] !== undefined ? cols[5].toLowerCase() === "true" : true,
    oktaId: cols[6] || undefined,
  })).filter((u) => u.userName);
}

export function parseGroupsCsv(text: string): MigrationGroup[] {
  const rows = parseCsv(text);
  return rows.map((cols) => ({
    displayName: cols[0] || "",
    oktaId: cols[1] || undefined,
  })).filter((g) => g.displayName);
}

export function parseMembershipsCsv(text: string): MigrationMembership[] {
  const rows = parseCsv(text);
  const map = new Map<string, string[]>();

  for (const cols of rows) {
    const groupDisplayName = cols[0] || "";
    const memberUserName = cols[1] || "";
    if (!groupDisplayName || !memberUserName) continue;

    const existing = map.get(groupDisplayName) || [];
    if (!existing.includes(memberUserName)) existing.push(memberUserName);
    map.set(groupDisplayName, existing);
  }

  return Array.from(map.entries()).map(([groupDisplayName, memberUserNames]) => ({
    groupDisplayName,
    memberUserNames,
  }));
}

export async function readCsvInput(
  usersFile: string,
  groupsFile: string,
  membershipsFile: string
): Promise<MigrationInput> {
  const [usersText, groupsText, membershipsText] = await Promise.all([
    fs.readFile(usersFile, "utf-8"),
    fs.readFile(groupsFile, "utf-8"),
    fs.readFile(membershipsFile, "utf-8"),
  ]);

  return {
    migrationId: `csv-import-${new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19)}`,
    source: "okta",
    target: "huawei-iam-identity-center",
    users: parseUsersCsv(usersText),
    groups: parseGroupsCsv(groupsText),
    memberships: parseMembershipsCsv(membershipsText),
  };
}

export async function readInput(args: Record<string, unknown>): Promise<MigrationInput> {
  if (args.usersFile && args.groupsFile && args.membershipsFile) {
    return readCsvInput(
      args.usersFile as string,
      args.groupsFile as string,
      args.membershipsFile as string
    );
  }

  if (args.inputFile) {
    const raw = await fs.readFile(args.inputFile as string, "utf-8");
    return JSON.parse(raw);
  }

  if (args.inputJson) {
    return JSON.parse(args.inputJson as string);
  }

  if (args.users || args.groups || args.memberships) {
    return {
      migrationId: args.migrationId as string,
      source: (args.source as string) || "okta",
      target: (args.target as string) || "huawei-iam-identity-center",
      users: (args.users as MigrationUser[]) || [],
      groups: (args.groups as MigrationGroup[]) || [],
      memberships: (args.memberships as MigrationMembership[]) || [],
    };
  }

  throw new Error("Provide inputJson, inputFile, {users, groups, memberships}, or {usersFile, groupsFile, membershipsFile} for CSV");
}
