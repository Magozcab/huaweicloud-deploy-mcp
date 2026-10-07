# Huawei IIC Okta Migration Agent

Migrate Okta users, groups, and group memberships into **Huawei IAM Identity Center** using direct SCIM operations — without relying on Okta Group Push.

## Why This Exists

Okta Group Push fails because it sends PATCH requests using **Okta internal IDs** for groups and members. Huawei IAM Identity Center expects **Huawei SCIM IDs**. This agent executes the correct SCIM sequence directly against Huawei.

## Correct SCIM Sequence

1. **Resolve user** by `userName`: `GET /Users?filter=userName eq "<userName>"`
2. **If user does not exist**, create it: `POST /Users`
3. **Store Huawei SCIM `user.id`**
4. **Resolve group** by `displayName` (list + match), or create group and store returned `group.id`
5. **Patch group membership**: `PATCH /Groups/{huawei_group_id}`
6. **Use Huawei SCIM user IDs** in `members.value` — never Okta internal IDs

## Safety Constraints

| Constraint | Enforcement |
|---|---|
| Default mode is DRY_RUN | All write operations are no-op unless `live=true` |
| Write operations require `confirm=true` | Every create/patch tool aborts without explicit confirmation |
| Never log secrets | Evidence logger redacts tokens, passwords, cookies, Authorization headers |
| Never use Okta internal IDs as SCIM IDs | Executor resolves Huawei IDs before any PATCH |
| No unsupported filters | Only `userName`, `id`, `externalId` for user resolution |
| No bulk deletion | No delete tools in this version |
| Idempotent | Re-running does not duplicate users, groups, or memberships |
| Partial failure preserves state | Checkpoint saved after each operation; rerun resumes |

## Environment Variables

```bash
export HUAWEI_SCIM_BASE_URL="https://identitycenter.myhuaweicloud.com/scim/v2/OrgId"
export HUAWEI_SCIM_TOKEN="your-bearer-token"
export MIGRATION_EVIDENCE_DIR="./evidence"
export MIGRATION_STATE_FILE="./migration-state.json"
```

## MCP Tools

| Tool | Type | Description |
|---|---|---|
| `scim_test_connection` | read | Test SCIM endpoint connectivity |
| `scim_list_users` | read | List users with pagination |
| `scim_resolve_user` | read | Resolve user by `userName` |
| `scim_create_user` | write | Create user (requires `confirm=true`) |
| `scim_list_groups` | read | List groups with pagination |
| `scim_create_group` | write | Create group (requires `confirm=true`) |
| `scim_add_group_members` | write | PATCH members into group (requires `confirm=true`) |
| `plan_migration` | read/write | Validate input and create migration plan |
| `execute_migration` | write | Execute plan (DRY_RUN by default, `confirm=true` + `live=true` for real) |
| `get_migration_status` | read | Read checkpoint state |
| `get_evidence_summary` | read | Summarize evidence logs |

## Quick Start

```bash
# Install
cd huawei-iic-okta-migration-agent
npm install
npm run build

# Test connection
# (via MCP tool: scim_test_connection)

# Plan migration (DRY_RUN)
# (via MCP tool: plan_migration with inputJson or inputFile)

# Execute migration (DRY_RUN first)
# (via MCP tool: execute_migration with planId)

# Execute migration (LIVE - real writes)
# (via MCP tool: execute_migration with planId, live=true, confirm=true)
```

## Input Format

```json
{
  "users": [
    {
      "userName": "user@example.com",
      "displayName": "User Name",
      "givenName": "User",
      "familyName": "Name",
      "email": "user@example.com",
      "active": true,
      "externalId": "okta-00u1abc"
    }
  ],
  "groups": [
    {
      "displayName": "My-Group",
      "externalId": "okta-grp-1"
    }
  ],
  "memberships": [
    {
      "groupDisplayName": "My-Group",
      "memberUserNames": ["user@example.com"]
    }
  ]
}
```

## Evidence

All SCIM operations are logged as NDJSON in `./evidence/evidence-YYYY-MM-DD.ndjson` with sanitized headers (no tokens, passwords, or session IDs).

## State Checkpoint

Migration state is saved to `./migration-state.json` after every operation. On failure, the state is preserved and can be resumed by re-running `execute_migration` with the same `planId`.

## Unsupported Huawei SCIM Filters

Do NOT use these filters — they are not supported by Huawei IAM Identity Center:

- `filter=email eq "..."`
- `filter=emails.value eq "..."`
- `filter=displayName eq "..."` (for Users)
- `filter=groups.value eq "..."`

Use only: `userName`, `id`, or `externalId` for user resolution.

## License

MIT
