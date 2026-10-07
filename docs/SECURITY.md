# Security Guidelines

## Secret Management

- **Never commit credentials to Git.** `.gitignore` excludes `.env`, `*.pem`, `*.key`, `terraform.tfstate`
- Use environment variables for AK/SK, project IDs, and tokens
- Use a secrets manager (e.g., Huawei Cloud DEW) for production deployments
- Rotate credentials regularly, especially after any suspected exposure

## Principle of Least Privilege

| MCP | Required Permissions |
|-----|---------------------|
| huaweicloud-pricing | BSS read-only |
| huaweicloud-deploy | Terraform plan (read-only cloud access) |
| huaweicloud-drs | DRS task management |
| huaweicloud-ticket | Ticket creation |
| dataarts-deploy-agent | DataArts Factory + DLI |
| huawei-iic-okta-migration | IAM Identity Center SCIM |
| huawei-console-mcp | Console session (cookies) |

## Read/Write Separation

| MCP | Read-Only | Write (approval required) | Risk |
|-----|-----------|---------------------------|------|
| huaweicloud-pricing | 25 | 0 | None |
| huaweicloud-deploy | 3 | 1 (local FS only) | Low |
| huaweicloud-drs | 10 | 3 (`explicit_approval`) | High |
| huaweicloud-ticket | 9 | 1 (`create_ticket`) | High |
| dataarts-deploy-agent | 4 | 2 (`confirm=true`) | High |
| huawei-iic-okta-migration | 7 | 3 (`confirm=true`) | High |
| huawei-console-mcp | 10 | 2 (login, fill) | Medium |

## CIDR Restrictions

- DRS MCP rejects `0.0.0.0/0` and CIDRs broader than `/32`
- All source access plans use `/32` CIDR for DRS EIP
- Validation at the tool level, not the agent level

## Explicit Approval Gates

All write operations require explicit boolean approval:

```javascript
// DRS pattern
if (!explicit_approval) { return "Requires explicit_approval=true"; }

// DataArts pattern
if (!confirm) { return "Requires confirm=true"; }

// Ticket pattern
// Use prepare_ticket first, then create_ticket
```

## Log Sanitization

- All MCP outputs scrubbed of AK/SK, tokens, and passwords
- DRS reports confirm "no credentials printed and no 0.0.0.0/0 access"
- DataArts reports use `scrubSecrets()` to remove sensitive values
- IIC migration evidence logs use sanitized headers

## Destructive Operation Review

| Operation | Risk | Mitigation |
|-----------|------|------------|
| `drs_start_task` | Starts real replication (irreversible) | `explicit_approval=true` required |
| `create_ticket` | Creates real support ticket | `prepare_ticket` review first |
| `snowflake_dataarts_demo_run` | Executes real DataArts jobs | `confirm=true` required |
| `migration_execute` | Creates real IAM users/groups | `confirm=true` required; DRY_RUN default |
| `terraform apply` | Creates real infrastructure | **FORBIDDEN in code** — must run manually |

## Security Scan Results

- CRITICAL findings: 0
- HIGH findings: 0
- AK/SK in files: not found
- API tokens: not found
- Passwords: not found
- Private keys: not found
- Cookies/sessions: not found
- .env files: not found (only .env.example)
- PEM/key files: not found
- Terraform state: not found
