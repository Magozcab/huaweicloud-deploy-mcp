import { ScimClient } from "./dist/scim/client.js";
import fs from "fs";
import path from "path";

const SCIM_BASE_URL = process.env.HUAWEI_SCIM_BASE_URL;
const SCIM_TOKEN = process.env.HUAWEI_SCIM_TOKEN;
const INPUT_FILE = process.argv[2] || "../demo-inputs/okta-existing-users-groups.json";
const EVIDENCE_DIR = process.env.MIGRATION_EVIDENCE_DIR || "./evidence-dry-run";

if (!SCIM_BASE_URL || !SCIM_TOKEN) {
  console.error("ERROR: HUAWEI_SCIM_BASE_URL and HUAWEI_SCIM_TOKEN must be set in environment");
  process.exit(1);
}

const urlObj = new URL(SCIM_BASE_URL);
const sanitizedUrl = `${urlObj.protocol}//${urlObj.hostname}/${urlObj.pathname.split("/").slice(1, 3).join("/")}/***`;
console.log(`HUAWEI_SCIM_BASE_URL = ${sanitizedUrl}`);
console.log(`HUAWEI_SCIM_TOKEN    = present (${SCIM_TOKEN.length} chars)`);
console.log(`CONFIRM              = false (dry run only)\n`);

const scim = new ScimClient(SCIM_BASE_URL, SCIM_TOKEN);
const evidence = [];
let stepNum = 0;

function logStep(method, path, status, detail) {
  stepNum++;
  const entry = { step: stepNum, method, path, status, detail, timestamp: new Date().toISOString() };
  evidence.push(entry);
  const redactedPath = path.replace(/Bearer [^\s]+/, "Bearer ***");
  console.log(`  Step ${stepNum}: ${method} ${redactedPath} => ${status} | ${detail}`);
}

async function run() {
  const input = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));
  console.log(`Migration ID : ${input.migrationId}`);
  console.log(`Input file   : ${INPUT_FILE}`);
  console.log(`Users        : ${input.users.length}`);
  console.log(`Groups       : ${input.groups.length}\n`);

  const stats = {
    usersToFind: 0, usersFound: 0, usersToCreate: 0,
    groupsToFind: 0, groupsFound: 0, groupsToCreate: 0, groupsFilterUnsupported: 0,
    membershipsToAdd: 0, membershipsBlocked: 0,
  };
  const userMap = new Map();
  const groupMap = new Map();

  // ── PHASE 1: Resolve users ──
  console.log("═".repeat(60));
  console.log("PHASE 1 — Resolve users in Huawei (dry run)");
  console.log("═".repeat(60));

  for (const user of input.users) {
    stats.usersToFind++;
    console.log(`\n  [USER] ${user.userName}`);
    try {
      const result = await scim.getUserByUserName(user.userName);
      if (result.found) {
        logStep("GET", `/Users?filter=userName eq "${user.userName}"`, 200, `FOUND — Huawei ID: ${result.huaweiUserId}`);
        userMap.set(user.userName, { huaweiUserId: result.huaweiUserId, action: "found" });
        stats.usersFound++;
      } else {
        logStep("GET", `/Users?filter=userName eq "${user.userName}"`, 200, "NOT FOUND — would POST /Users");
        userMap.set(user.userName, { huaweiUserId: null, action: "to_create" });
        stats.usersToCreate++;
      }
    } catch (err) {
      logStep("GET", `/Users?filter=userName eq "${user.userName}"`, "ERROR", err.message);
      userMap.set(user.userName, { huaweiUserId: null, action: "error" });
    }
  }

  // ── PHASE 2: Resolve groups ──
  console.log("\n" + "═".repeat(60));
  console.log("PHASE 2 — Resolve groups in Huawei (dry run)");
  console.log("═".repeat(60));

  for (const group of input.groups) {
    stats.groupsToFind++;
    console.log(`\n  [GROUP] ${group.displayName}`);
    try {
      const result = await scim.getGroupByDisplayName(group.displayName);
      if (result.found) {
        logStep("GET", `/Groups?filter=displayName eq "${group.displayName}"`, 200, `FOUND — Huawei ID: ${result.huaweiGroupId}`);
        groupMap.set(group.displayName, { huaweiGroupId: result.huaweiGroupId, action: "found" });
        stats.groupsFound++;
      } else if (!result.filterSupported) {
        stats.groupsFilterUnsupported++;
        logStep("GET", `/Groups?filter=displayName eq "${group.displayName}"`, "N/A", `Filter unsupported — would list all groups or POST /Groups`);
        groupMap.set(group.displayName, { huaweiGroupId: null, action: "filter_unsupported" });
        stats.groupsToCreate++;
      } else {
        logStep("GET", `/Groups?filter=displayName eq "${group.displayName}"`, 200, "NOT FOUND — would POST /Groups");
        groupMap.set(group.displayName, { huaweiGroupId: null, action: "to_create" });
        stats.groupsToCreate++;
      }
    } catch (err) {
      logStep("GET", `/Groups?filter=displayName eq "${group.displayName}"`, "ERROR", err.message);
      groupMap.set(group.displayName, { huaweiGroupId: null, action: "error" });
    }
  }

  // ── PHASE 3: Plan membership PATCHes ──
  console.log("\n" + "═".repeat(60));
  console.log("PHASE 3 — Plan group membership PATCHes (dry run)");
  console.log("═".repeat(60));

  for (const group of input.groups) {
    if (!group.members || group.members.length === 0) {
      console.log(`\n  [MEMBERS] ${group.displayName}: no members — skip`);
      continue;
    }
    console.log(`\n  [MEMBERS] ${group.displayName} (${group.members.length} members)`);
    const groupInfo = groupMap.get(group.displayName);
    if (!groupInfo || !groupInfo.huaweiGroupId) {
      console.log(`    BLOCKED: group has no Huawei ID (action: ${groupInfo?.action || "unknown"})`);
      console.log(`    Would need to resolve/create group first, then PATCH`);
      for (const m of group.members) {
        stats.membershipsBlocked++;
      }
      continue;
    }
    for (const memberUserName of group.members) {
      const userInfo = userMap.get(memberUserName);
      if (!userInfo || !userInfo.huaweiUserId) {
        console.log(`    BLOCKED: ${memberUserName} has no Huawei ID (action: ${userInfo?.action || "unknown"})`);
        stats.membershipsBlocked++;
        continue;
      }
      console.log(`    PLAN: PATCH /Groups/${groupInfo.huaweiGroupId} — Add member ${memberUserName} (Huawei ID: ${userInfo.huaweiUserId})`);
      stats.membershipsToAdd++;
    }
  }

  // ── PHASE 4: Dry-run summary ──
  console.log("\n" + "═".repeat(60));
  console.log("DRY-RUN EXECUTION TABLE (confirm=false)");
  console.log("═".repeat(60));
  console.log(`
  ┌──────────────────────────┬───────┐
  │ Metric                   │ Count │
  ├──────────────────────────┼───────┤
  │ Users in input           │ ${String(input.users.length).padStart(5)} │
  │ Users found in Huawei    │ ${String(stats.usersFound).padStart(5)} │
  │ Users to create          │ ${String(stats.usersToCreate).padStart(5)} │
  │ Groups in input          │ ${String(input.groups.length).padStart(5)} │
  │ Groups found in Huawei   │ ${String(stats.groupsFound).padStart(5)} │
  │ Groups to create         │ ${String(stats.groupsToCreate).padStart(5)} │
  │ Memberships to add       │ ${String(stats.membershipsToAdd).padStart(5)} │
  │ Memberships blocked      │ ${String(stats.membershipsBlocked).padStart(5)} │
  └──────────────────────────┴───────┘

  Final status: DRY RUN COMPLETE — no writes executed
  Next step   : Review above, then run with confirm=true to execute
`);

  saveEvidence();
}

function saveEvidence() {
  if (!fs.existsSync(EVIDENCE_DIR)) fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const file = path.join(EVIDENCE_DIR, `dry-run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
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
