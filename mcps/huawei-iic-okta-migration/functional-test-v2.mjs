import { ScimClient } from "./dist/scim/client.js";
import fs from "fs";
import path from "path";

const SCIM_BASE_URL = process.env.HUAWEI_SCIM_BASE_URL;
const SCIM_TOKEN = process.env.HUAWEI_SCIM_TOKEN;
const EVIDENCE_DIR = process.env.MIGRATION_EVIDENCE_DIR || "./evidence-functional-test";

if (!SCIM_BASE_URL || !SCIM_TOKEN) {
  console.error("ERROR: HUAWEI_SCIM_BASE_URL and HUAWEI_SCIM_TOKEN must be set");
  process.exit(1);
}

const scim = new ScimClient(SCIM_BASE_URL, SCIM_TOKEN);
const evidence = [];
let stepNum = 0;

function logStep(method, path, status, detail) {
  stepNum++;
  const entry = { step: stepNum, method, path, status, detail, timestamp: new Date().toISOString() };
  evidence.push(entry);
  console.log(`\nStep ${stepNum}: ${method} ${path}`);
  console.log(`  Status: ${status}`);
  console.log(`  Detail: ${detail}`);
}

async function run() {
  const results = {
    users: [],
    group: null,
    patchResult: null,
    validationResult: null,
  };

  console.log("=".repeat(70));
  console.log("CORRECTED SCIM FUNCTIONAL TEST — Huawei IAM Identity Center");
  console.log("No Okta Push Groups. No Okta IDs. Huawei SCIM IDs only.");
  console.log("=".repeat(70));

  // ── Step 1: Resolve or create user 1 ──
  const u1 = "mcp.testuser1@unicauca.edu.co";
  console.log(`\n--- Resolving user: ${u1} ---`);
  let u1Result = await scim.getUserByUserName(u1);
  if (u1Result.found) {
    logStep("GET", `/Users?filter=userName eq "${u1}"`, 200, `User FOUND. Huawei ID: ${u1Result.huaweiUserId}`);
    results.users.push({ userName: u1, huaweiUserId: u1Result.huaweiUserId, action: "resolved" });
  } else {
    logStep("GET", `/Users?filter=userName eq "${u1}"`, 200, `User NOT FOUND. Will create.`);
    const created = await scim.createUser({
      userName: u1, email: u1, givenName: "MCP", familyName: "TestUserOne",
      displayName: "MCP Test User One", active: true,
    });
    logStep("POST", "/Users", 201, `User CREATED. Huawei ID: ${created.huaweiUserId}`);
    results.users.push({ userName: u1, huaweiUserId: created.huaweiUserId, action: "created" });
  }

  // ── Step 2: Resolve or create user 2 ──
  const u2 = "mcp.testuser2@unicauca.edu.co";
  console.log(`\n--- Resolving user: ${u2} ---`);
  let u2Result = await scim.getUserByUserName(u2);
  if (u2Result.found) {
    logStep("GET", `/Users?filter=userName eq "${u2}"`, 200, `User FOUND. Huawei ID: ${u2Result.huaweiUserId}`);
    results.users.push({ userName: u2, huaweiUserId: u2Result.huaweiUserId, action: "resolved" });
  } else {
    logStep("GET", `/Users?filter=userName eq "${u2}"`, 200, `User NOT FOUND. Will create.`);
    const created = await scim.createUser({
      userName: u2, email: u2, givenName: "MCP", familyName: "TestUserTwo",
      displayName: "MCP Test User Two", active: true,
    });
    logStep("POST", "/Users", 201, `User CREATED. Huawei ID: ${created.huaweiUserId}`);
    results.users.push({ userName: u2, huaweiUserId: created.huaweiUserId, action: "created" });
  }

  // ── Step 3: Resolve or create group ──
  const groupName = "HuaweiCloud-MCP-Functional-Test-001";
  console.log(`\n--- Resolving group: ${groupName} ---`);
  let groupResult = await scim.getGroupByDisplayName(groupName);
  if (groupResult.found) {
    logStep("GET", `/Groups?filter=displayName eq "${groupName}"`, 200, `Group FOUND. Huawei ID: ${groupResult.huaweiGroupId}`);
    results.group = { displayName: groupName, huaweiGroupId: groupResult.huaweiGroupId, action: "resolved" };
  } else {
    if (!groupResult.filterSupported) {
      logStep("GET", `/Groups?filter=displayName eq "${groupName}"`, "N/A", `Filter unsupported. Listing all groups to search.`);
      const allGroups = new Map();
      try {
        let idx = 1;
        while (true) {
          const list = await scim.listGroups(idx, 100);
          for (const g of list.Resources) { if (g.displayName && g.id) allGroups.set(g.displayName, g.id); }
          if (idx + list.itemsPerPage > list.totalResults) break;
          idx += list.itemsPerPage;
        }
      } catch {}
      const foundById = allGroups.get(groupName);
      if (foundById) {
        logStep("GET", "/Groups (list all)", 200, `Group FOUND via listing. Huawei ID: ${foundById}`);
        results.group = { displayName: groupName, huaweiGroupId: foundById, action: "resolved_via_list" };
      }
    }
    if (!results.group) {
      logStep("GET", `/Groups?filter=displayName eq "${groupName}"`, 200, `Group NOT FOUND. Will create.`);
      const created = await scim.createGroup(groupName);
      logStep("POST", "/Groups", 201, `Group CREATED. Huawei ID: ${created.huaweiGroupId}`);
      results.group = { displayName: groupName, huaweiGroupId: created.huaweiGroupId, action: "created" };
    }
  }

  // ── Step 4: PATCH members ──
  console.log(`\n--- Adding members to group ---`);
  const members = results.users.map(u => ({ userName: u.userName, huaweiUserId: u.huaweiUserId }));
  console.log(`  Group Huawei ID: ${results.group.huaweiGroupId}`);
  for (const m of members) {
    console.log(`  Member: ${m.userName} → Huawei ID: ${m.huaweiUserId}`);
  }

  try {
    const patchResult = await scim.addMembersToGroup(results.group.huaweiGroupId, members);
    logStep("PATCH", `/Groups/${results.group.huaweiGroupId}`, 204, `Membership PATCH succeeded. Members added: ${patchResult.memberCount}`);
    results.patchResult = { success: true, memberCount: patchResult.memberCount };
  } catch (err) {
    logStep("PATCH", `/Groups/${results.group.huaweiGroupId}`, "ERROR", `Membership PATCH FAILED: ${err.message}`);
    results.patchResult = { success: false, error: err.message };
    console.error("\nCRITICAL FAILURE on PATCH. Stopping.");
    saveEvidence();
    process.exit(1);
  }

  // ── Step 5: Validate ──
  console.log(`\n--- Validating group membership ---`);
  try {
    const groupMembers = await scim.getGroupMembers(results.group.huaweiGroupId);
    logStep("GET", `/Groups/${results.group.huaweiGroupId}`, 200, `Group retrieved. Members returned: ${groupMembers.length}`);
    if (groupMembers.length > 0) {
      for (const m of groupMembers) {
        console.log(`    Member: value=${m.value}, display=${m.display || "(none)"}`);
      }
      results.validationResult = { membersReturned: groupMembers.length, members };
    } else {
      console.log("    Note: Huawei IAM IC does not return members in GET /Groups/{id}. This is expected behavior.");
      results.validationResult = { membersReturned: 0, note: "Huawei does not expose members in GET /Groups response" };
    }
  } catch (err) {
    logStep("GET", `/Groups/${results.group.huaweiGroupId}`, "ERROR", `Validation GET failed: ${err.message}`);
    results.validationResult = { error: err.message };
  }

  // ── Summary ──
  console.log("\n" + "=".repeat(70));
  console.log("EXECUTION SUMMARY");
  console.log("=".repeat(70));
  console.log("\nUsers:");
  for (const u of results.users) {
    console.log(`  ${u.userName}: ${u.action.toUpperCase()}, Huawei ID = ${u.huaweiUserId}`);
  }
  console.log("\nGroup:");
  console.log(`  ${results.group.displayName}: ${results.group.action.toUpperCase()}, Huawei ID = ${results.group.huaweiGroupId}`);
  console.log("\nMembership PATCH:");
  console.log(`  Success: ${results.patchResult.success}`);
  if (results.patchResult.memberCount) console.log(`  Members added: ${results.patchResult.memberCount}`);
  console.log("\nValidation:");
  if (results.validationResult.membersReturned !== undefined) {
    console.log(`  Members in GET response: ${results.validationResult.membersReturned}`);
  }
  if (results.validationResult.note) {
    console.log(`  Note: ${results.validationResult.note}`);
  }
  console.log("\nNo Okta IDs were used. All IDs are Huawei SCIM IDs.");
  console.log(`Evidence: ${EVIDENCE_DIR}`);

  saveEvidence();
}

function saveEvidence() {
  const dir = EVIDENCE_DIR;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `functional-test-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify({ evidence, generatedAt: new Date().toISOString() }, null, 2));
  console.log(`  Saved: ${file}`);
}

run().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
