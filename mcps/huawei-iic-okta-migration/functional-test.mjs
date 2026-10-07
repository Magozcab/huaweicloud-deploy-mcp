import { ScimClient } from "./dist/scim/client.js";
import { EvidenceLogger } from "./dist/evidence/logger.js";
import { StateManager } from "./dist/migration/state.js";
import { MigrationExecutor, formatExecutionResult } from "./dist/migration/executor.js";
import fs from "fs";
import path from "path";

const SCIM_BASE_URL = process.env.HUAWEI_SCIM_BASE_URL;
const SCIM_TOKEN = process.env.HUAWEI_SCIM_TOKEN;
const EVIDENCE_DIR = process.env.MIGRATION_EVIDENCE_DIR || "./evidence-functional-test";
const STATE_FILE = process.env.MIGRATION_STATE_FILE || "./migration-state-functional-test.json";
const CONFIRM = process.env.CONFIRM === "true";

if (!SCIM_BASE_URL || !SCIM_TOKEN) {
  console.error("ERROR: HUAWEI_SCIM_BASE_URL and HUAWEI_SCIM_TOKEN must be set");
  process.exit(1);
}

const INPUT = {
  migrationId: "huawei-iic-scim-functional-test-001",
  users: [
    {
      userName: "mcp.testuser1@unicauca.edu.co",
      email: "mcp.testuser1@unicauca.edu.co",
      givenName: "MCP",
      familyName: "TestUserOne",
      displayName: "MCP Test User One",
      active: true,
    },
    {
      userName: "mcp.testuser2@unicauca.edu.co",
      email: "mcp.testuser2@unicauca.edu.co",
      givenName: "MCP",
      familyName: "TestUserTwo",
      displayName: "MCP Test User Two",
      active: true,
    },
  ],
  groups: [
    {
      displayName: "HuaweiCloud-MCP-Functional-Test-001",
    },
  ],
  memberships: [
    {
      groupDisplayName: "HuaweiCloud-MCP-Functional-Test-001",
      memberUserNames: [
        "mcp.testuser1@unicauca.edu.co",
        "mcp.testuser2@unicauca.edu.co",
      ],
    },
  ],
};

async function run() {
  const mode = CONFIRM ? "LIVE" : "DRY_RUN";
  console.log("=".repeat(60));
  console.log(`Huawei IIC SCIM Functional Test — ${mode}`);
  console.log(`Migration ID: ${INPUT.migrationId}`);
  console.log(`SCIM Base URL: ${SCIM_BASE_URL}`);
  console.log(`Evidence Dir:  ${EVIDENCE_DIR}`);
  console.log(`State File:    ${STATE_FILE}`);
  console.log("=".repeat(60));

  const scim = new ScimClient(SCIM_BASE_URL, SCIM_TOKEN);
  const evidence = new EvidenceLogger(EVIDENCE_DIR);
  await evidence.init();
  const stateManager = new StateManager(STATE_FILE);

  console.log("\n--- Step 1: Validate input ---");
  if (!INPUT.users || INPUT.users.length === 0) {
    console.error("FAIL: No users in input");
    process.exit(1);
  }
  if (!INPUT.groups || INPUT.groups.length === 0) {
    console.error("FAIL: No groups in input");
    process.exit(1);
  }
  for (const u of INPUT.users) {
    if (!u.userName || !u.email) {
      console.error(`FAIL: User missing userName or email: ${JSON.stringify(u)}`);
      process.exit(1);
    }
  }
  console.log(`  Input valid: ${INPUT.users.length} users, ${INPUT.groups.length} groups, ${INPUT.memberships.length} memberships`);

  console.log("\n--- Step 2: Test SCIM connectivity ---");
  try {
    const conn = await scim.testConnection();
    console.log(`  Connected: ${conn.connected}`);
    if (conn.connected) {
      console.log(`  Existing users:  ${conn.userCount}`);
      console.log(`  Existing groups: ${conn.groupCount}`);
    } else {
      console.error(`  Connection error: ${conn.error}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`  Connection failed: ${err.message}`);
    process.exit(1);
  }

  console.log(`\n--- Step 3: Execute migration (${mode}) ---`);
  const executor = new MigrationExecutor(scim, evidence, stateManager);
  try {
    const result = await executor.execute(INPUT, !CONFIRM);
    console.log(formatExecutionResult(result));

    if (!CONFIRM) {
      console.log("\n--- DRY RUN COMPLETE ---");
      console.log("Review the results above. To execute for real, set CONFIRM=true and re-run.");
    } else {
      console.log("\n--- Step 4: Validate results ---");
      for (const u of result.users) {
        if (u.huaweiId && !u.huaweiId.startsWith("[DRY_RUN]")) {
          console.log(`  User ${u.input.userName}: Huawei ID = ${u.huaweiId} (${u.status})`);
        }
      }
      for (const g of result.groups) {
        if (g.huaweiId && !g.huaweiId.startsWith("[DRY_RUN]")) {
          console.log(`  Group ${g.input.displayName}: Huawei ID = ${g.huaweiId} (${g.status})`);
          try {
            const members = await scim.getGroupMembers(g.huaweiId);
            console.log(`    Members: ${members.length}`);
            for (const m of members) {
              console.log(`      - ${m.display || m.value}`);
            }
          } catch (err) {
            console.log(`    Could not fetch members: ${err.message}`);
          }
        }
      }
      for (const m of result.memberships) {
        console.log(`  Membership: ${m.memberUserName} in ${m.groupDisplayName} — ${m.status}`);
      }

      console.log("\n--- LIVE EXECUTION COMPLETE ---");
    }

    console.log(`\nEvidence directory: ${EVIDENCE_DIR}`);
    console.log(`State file: ${STATE_FILE}`);
  } catch (err) {
    console.error(`\nCRITICAL FAILURE: ${err.message}`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
