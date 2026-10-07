import { ScimClient } from "./dist/scim/client.js";

const SCIM_BASE_URL = process.env.HUAWEI_SCIM_BASE_URL;
const SCIM_TOKEN = process.env.HUAWEI_SCIM_TOKEN;

if (!SCIM_BASE_URL || !SCIM_TOKEN) {
  console.error("ERROR: HUAWEI_SCIM_BASE_URL and HUAWEI_SCIM_TOKEN must be set");
  process.exit(1);
}

const GROUP_ID = "4b1c34c0-bdbb-456e-babc-7f039ac2c619";
const USER1_ID = "5fb582de-28a4-4e16-b1b3-f8c851554f4b";
const USER2_ID = "fe4d99e9-2cac-452d-9fb1-f4ecc554e7de";

async function run() {
  const scim = new ScimClient(SCIM_BASE_URL, SCIM_TOKEN);

  console.log("--- Retrying PATCH: Add members to group ---");
  console.log(`  Group ID: ${GROUP_ID}`);
  console.log(`  User 1:   mcp.testuser1@unicauca.edu.co -> ${USER1_ID}`);
  console.log(`  User 2:   mcp.testuser2@unicauca.edu.co -> ${USER2_ID}`);

  try {
    const result = await scim.addMembersToGroup(GROUP_ID, [
      { userName: "mcp.testuser1@unicauca.edu.co", huaweiUserId: USER1_ID },
      { userName: "mcp.testuser2@unicauca.edu.co", huaweiUserId: USER2_ID },
    ]);
    console.log(`  PATCH result: success=${result.success}, memberCount=${result.memberCount}`);
  } catch (err) {
    console.error(`  PATCH failed: ${err.message}`);
    process.exit(1);
  }

  console.log("\n--- Validating: GET /Groups/{id} ---");
  try {
    const members = await scim.getGroupMembers(GROUP_ID);
    console.log(`  Members in group: ${members.length}`);
    for (const m of members) {
      console.log(`    - value: ${m.value}, display: ${m.display || "(none)"}`);
    }
  } catch (err) {
    console.log(`  Could not fetch members: ${err.message}`);
  }

  console.log("\n--- Validating: GET /Users for each user ---");
  for (const [userName, expectedId] of [
    ["mcp.testuser1@unicauca.edu.co", USER1_ID],
    ["mcp.testuser2@unicauca.edu.co", USER2_ID],
  ]) {
    const result = await scim.getUserByUserName(userName);
    console.log(`  ${userName}: found=${result.found}, id=${result.huaweiUserId}, matches=${result.huaweiUserId === expectedId}`);
  }
}

run().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
