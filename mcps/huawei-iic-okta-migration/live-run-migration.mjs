import { ScimClient } from "./dist/scim/client.js";
import fs from "fs";
import path from "path";

const SCIM_BASE_URL = process.env.HUAWEI_SCIM_BASE_URL;
const SCIM_TOKEN = process.env.HUAWEI_SCIM_TOKEN;
const INPUT_FILE = process.argv[2] || "../demo-inputs/okta-existing-users-groups.json";
const EVIDENCE_DIR = process.env.MIGRATION_EVIDENCE_DIR || "./evidence-live-run";

if (!SCIM_BASE_URL || !SCIM_TOKEN) {
  console.error("ERROR: HUAWEI_SCIM_BASE_URL and HUAWEI_SCIM_TOKEN must be set in environment");
  process.exit(1);
}

const urlObj = new URL(SCIM_BASE_URL);
const sanitizedUrl = `${urlObj.protocol}//${urlObj.hostname}/${urlObj.pathname.split("/").slice(1, 3).join("/")}/***`;
console.log(`HUAWEI_SCIM_BASE_URL = ${sanitizedUrl}`);
console.log(`HUAWEI_SCIM_TOKEN    = present (${SCIM_TOKEN.length} chars)`);
console.log(`CONFIRM              = true (LIVE)\n`);

const scim = new ScimClient(SCIM_BASE_URL, SCIM_TOKEN);
const evidence = [];
let stepNum = 0;

function logStep(method, path, status, detail) {
  stepNum++;
  const entry = { step: stepNum, method, path, status, detail, timestamp: new Date().toISOString() };
  evidence.push(entry);
  console.log(`  Step ${stepNum}: ${method} ${path} => ${status} | ${detail}`);
}

async function run() {
  const input = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));
  console.log(`Migration ID : ${input.migrationId}`);
  console.log(`Input file   : ${INPUT_FILE}`);
  console.log(`Users        : ${input.users.length}`);
  console.log(`Groups       : ${input.groups.length}\n`);

  const stats = {
    usersFound: 0, usersCreated: 0, usersFailed: 0,
    groupsFound: 0, groupsCreated: 0, groupsFailed: 0,
    membershipsAdded: 0, membershipsFailed: 0,
  };
  const userMap = new Map();
  const groupMap = new Map();
  let criticalFailure = false;

  // ── PHASE 1: Push users ──
  console.log("═".repeat(60));
  console.log("PHASE 1 — Push users to Huawei");
  console.log("═".repeat(60));

  for (const user of input.users) {
    console.log(`\n  [USER] ${user.userName}`);
    try {
      const result = await scim.getUserByUserName(user.userName);
      if (result.found) {
        logStep("GET", `/Users?filter=userName eq "${user.userName}"`, 200, `FOUND — Huawei ID: ${result.huaweiUserId}`);
        userMap.set(user.userName, { huaweiUserId: result.huaweiUserId, action: "found" });
        stats.usersFound++;
      } else {
        logStep("GET", `/Users?filter=userName eq "${user.userName}"`, 200, "NOT FOUND — creating...");
        const created = await scim.createUser({
          userName: user.userName,
          email: user.email,
          givenName: user.givenName,
          familyName: user.familyName,
          displayName: user.displayName,
          active: user.active,
        });
        logStep("POST", "/Users", 201, `CREATED — Huawei ID: ${created.huaweiUserId}`);
        userMap.set(user.userName, { huaweiUserId: created.huaweiUserId, action: "created" });
        stats.usersCreated++;
      }
    } catch (err) {
      logStep("USER", user.userName, "ERROR", err.message);
      userMap.set(user.userName, { huaweiUserId: null, action: "failed" });
      stats.usersFailed++;
    }
  }

  // ── PHASE 2: Push groups ──
  console.log("\n" + "═".repeat(60));
  console.log("PHASE 2 — Push groups to Huawei");
  console.log("═".repeat(60));

  for (const group of input.groups) {
    console.log(`\n  [GROUP] ${group.displayName}`);
    try {
      const result = await scim.getGroupByDisplayName(group.displayName);
      if (result.found) {
        logStep("GET", `/Groups?filter=displayName eq "${group.displayName}"`, 200, `FOUND — Huawei ID: ${result.huaweiGroupId}`);
        groupMap.set(group.displayName, { huaweiGroupId: result.huaweiGroupId, action: "found" });
        stats.groupsFound++;
      } else if (!result.filterSupported) {
        logStep("GET", `/Groups?filter=displayName eq "${group.displayName}"`, "N/A", "Filter unsupported — listing all groups...");
        let foundViaList = null;
        try {
          let idx = 1;
          while (true) {
            const list = await scim.listGroups(idx, 100);
            const match = list.Resources.find(g => g.displayName === group.displayName);
            if (match) { foundViaList = match; break; }
            if (idx + list.itemsPerPage > list.totalResults) break;
            idx += list.itemsPerPage;
          }
        } catch {}
        if (foundViaList) {
          logStep("GET", "/Groups (list)", 200, `FOUND via listing — Huawei ID: ${foundViaList.id}`);
          groupMap.set(group.displayName, { huaweiGroupId: foundViaList.id, action: "found_via_list" });
          stats.groupsFound++;
        } else {
          logStep("GET", "/Groups (list)", 200, "NOT FOUND — creating...");
          const created = await scim.createGroup(group.displayName);
          logStep("POST", "/Groups", 201, `CREATED — Huawei ID: ${created.huaweiGroupId}`);
          groupMap.set(group.displayName, { huaweiGroupId: created.huaweiGroupId, action: "created" });
          stats.groupsCreated++;
        }
      } else {
        logStep("GET", `/Groups?filter=displayName eq "${group.displayName}"`, 200, "NOT FOUND — creating...");
        const created = await scim.createGroup(group.displayName);
        logStep("POST", "/Groups", 201, `CREATED — Huawei ID: ${created.huaweiGroupId}`);
        groupMap.set(group.displayName, { huaweiGroupId: created.huaweiGroupId, action: "created" });
        stats.groupsCreated++;
      }
    } catch (err) {
      logStep("GROUP", group.displayName, "ERROR", err.message);
      groupMap.set(group.displayName, { huaweiGroupId: null, action: "failed" });
      stats.groupsFailed++;
    }
  }

  // ── PHASE 3: Push memberships ──
  console.log("\n" + "═".repeat(60));
  console.log("PHASE 3 — Push group memberships to Huawei");
  console.log("═".repeat(60));

  for (const group of input.groups) {
    if (!group.members || group.members.length === 0) {
      console.log(`\n  [MEMBERS] ${group.displayName}: no members — skip`);
      continue;
    }
    console.log(`\n  [MEMBERS] ${group.displayName} (${group.members.length} members)`);

    const groupInfo = groupMap.get(group.displayName);
    if (!groupInfo || !groupInfo.huaweiGroupId) {
      console.log(`    SKIP: group has no Huawei ID (action: ${groupInfo?.action || "unknown"})`);
      for (const m of group.members) stats.membershipsFailed++;
      continue;
    }

    const resolvedMembers = [];
    for (const memberUserName of group.members) {
      const userInfo = userMap.get(memberUserName);
      if (!userInfo || !userInfo.huaweiUserId) {
        console.log(`    SKIP: ${memberUserName} has no Huawei ID (action: ${userInfo?.action || "unknown"})`);
        stats.membershipsFailed++;
        continue;
      }
      resolvedMembers.push({ userName: memberUserName, huaweiUserId: userInfo.huaweiUserId });
    }

    if (resolvedMembers.length === 0) continue;

    try {
      const patchResult = await scim.addMembersToGroup(groupInfo.huaweiGroupId, resolvedMembers);
      logStep("PATCH", `/Groups/${groupInfo.huaweiGroupId}`, 204, `SUCCESS — ${patchResult.memberCount} member(s) added`);
      stats.membershipsAdded += patchResult.memberCount;
    } catch (err) {
      logStep("PATCH", `/Groups/${groupInfo.huaweiGroupId}`, "ERROR", `FAILED: ${err.message}`);
      stats.membershipsFailed += resolvedMembers.length;
      console.error(`\n  CRITICAL FAILURE on PATCH /Groups/${groupInfo.huaweiGroupId}. Stopping.`);
      criticalFailure = true;
      break;
    }
  }

  // ── PHASE 4: Validation ──
  if (!criticalFailure) {
    console.log("\n" + "═".repeat(60));
    console.log("PHASE 4 — Validation");
    console.log("═".repeat(60));

    let usersValidated = 0;
    for (const [userName, info] of userMap) {
      if (info.huaweiUserId) usersValidated++;
    }
    let groupsValidated = 0;
    for (const [displayName, info] of groupMap) {
      if (info.huaweiGroupId) groupsValidated++;
    }
    console.log(`  Users with Huawei ID  : ${usersValidated}/${input.users.length}`);
    console.log(`  Groups with Huawei ID : ${groupsValidated}/${input.groups.length}`);
    console.log(`  Memberships added     : ${stats.membershipsAdded}`);
  }

  // ── Summary ──
  const totalUsers = input.users.length;
  const totalGroups = input.groups.length;
  const finalStatus = criticalFailure ? "CRITICAL FAILURE" : "SUCCESS";

  console.log("\n" + "═".repeat(60));
  console.log("EXECUTION TABLE (confirm=true)");
  console.log("═".repeat(60));
  console.log(`
  ┌──────────────────────────┬───────┐
  │ Metric                   │ Count │
  ├──────────────────────────┼───────┤
  │ Total users in input     │ ${String(totalUsers).padStart(5)} │
  │ Users found in Huawei    │ ${String(stats.usersFound).padStart(5)} │
  │ Users created in Huawei  │ ${String(stats.usersCreated).padStart(5)} │
  │ Users failed             │ ${String(stats.usersFailed).padStart(5)} │
  │ Total groups in input    │ ${String(totalGroups).padStart(5)} │
  │ Groups found in Huawei   │ ${String(stats.groupsFound).padStart(5)} │
  │ Groups created in Huawei │ ${String(stats.groupsCreated).padStart(5)} │
  │ Groups failed            │ ${String(stats.groupsFailed).padStart(5)} │
  │ Memberships added        │ ${String(stats.membershipsAdded).padStart(5)} │
  │ Memberships failed       │ ${String(stats.membershipsFailed).padStart(5)} │
  ├──────────────────────────┼───────┤
  │ Final status             │ ${finalStatus.padStart(5)} │
  └──────────────────────────┴───────┘
`);

  // ── Save state ──
  const stateFile = process.env.MIGRATION_STATE_FILE || "./migration-state-live.json";
  const state = {
    migrationId: input.migrationId,
    executedAt: new Date().toISOString(),
    confirm: true,
    users: Object.fromEntries([...userMap].map(([k, v]) => [k, { huaweiUserId: v.huaweiUserId, action: v.action }])),
    groups: Object.fromEntries([...groupMap].map(([k, v]) => [k, { huaweiGroupId: v.huaweiGroupId, action: v.action }])),
    stats,
    finalStatus,
  };
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  console.log(`  State saved: ${stateFile}`);

  saveEvidence();

  if (criticalFailure) process.exit(1);
}

function saveEvidence() {
  if (!fs.existsSync(EVIDENCE_DIR)) fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const file = path.join(EVIDENCE_DIR, `live-run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const sanitized = JSON.parse(JSON.stringify(evidence, (key, val) => {
    if (typeof val === "string") return val.replace(/Bearer [^\s]+/, "Bearer ***");
    return val;
  }));
  fs.writeFileSync(file, JSON.stringify({ evidence: sanitized, generatedAt: new Date().toISOString() }, null, 2));
  console.log(`  Evidence saved: ${file}`);
}

run().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
