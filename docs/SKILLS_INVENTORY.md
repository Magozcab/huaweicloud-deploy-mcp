# Skills Inventory

## Operational Skills

| Skill | Domain | Family | Scenario | Status | Risk | Mechanism | Required MCP | Phases | Tests |
|-------|--------|--------|----------|--------|------|-----------|--------------|--------|-------|
| [huawei-cbr-backup-restore](../skills/huawei-cbr-backup-restore/) | Cloud Foundation | DR & Backup | CBR backup/restore | READY_WITH_WARNINGS | High | hcloud CLI | — | 14 | 27 |
| [huawei-cce-cross-region-velero-migration](../skills/huawei-cce-cross-region-velero-migration/) | Migration | Container | CCE cross-region Velero | EXPERIMENTAL | High | deploy MCP | huaweicloud-deploy | 10 | 16 |
| [huawei-dws-cluster-deployment](../skills/huawei-dws-cluster-deployment/) | Big Data | Data Warehouse | DWS cluster deployment | READY_WITH_WARNINGS | High | hcloud CLI | — | 20 | 45 |
| [huawei-postgresql-ecs-to-rds-drs-cross-region](../skills/huawei-postgresql-ecs-to-rds-drs-cross-region/) | Migration | Database | PostgreSQL ECS→RDS DRS | READY_WITH_WARNINGS | High | DRS MCP | huaweicloud-drs | 10 | 58 |
| [huawei-sdr-cross-region-replication](../skills/huawei-sdr-cross-region-replication/) | Cloud Foundation | DR & Backup | SDRS cross-region DR | EXPERIMENTAL | Critical | Supervised console | — | 18 | 40 |
| [huawei-snowflake-to-dataarts-migration](../skills/huawei-snowflake-to-dataarts-migration/) | Migration | Data Platform | Snowflake→DataArts | PARTIAL | Medium | dataarts MCP | dataarts-deploy-agent | 10 | 17 |

## Shared Skills

| Skill | Purpose | Status | Risk | Tests |
|-------|---------|--------|------|-------|
| [mcp-capability-builder](../skills/mcp-capability-builder/) | Gap analysis & MCP scaffold generation | READY_WITH_WARNINGS | Low | Design |

## OpenCode Agent Skills

| Skill | Purpose | Tools | Trigger Keywords |
|-------|---------|-------|------------------|
| [codearts-cicd](../opencode-skills/codearts-cicd/) | CI/CD pipeline automation | 8 | pipeline, build, codearts, CI/CD, webhook |
| [outlook-email](../opencode-skills/outlook-email/) | Email management | 7 | email, outlook, inbox, enviar email |
| [postman-to-codearts](../opencode-skills/postman-to-codearts/) | Postman→CodeArts conversion | 1 | postman, testplan, api test |
| [huawei-console-login](../opencode-skills/huawei-console-login/) | Console authentication | 2 | login, MFA, captcha, console |

## Automation Summary

| Skill | Automated | Assisted | Manual | Not Implemented | Gaps |
|-------|-----------|----------|--------|-----------------|------|
| CBR Backup/Restore | 3 | 9 | 0 | 0 | 5 |
| CCE Velero Migration | 0 | 4 | 5 | 1 | 7 |
| DWS Cluster Deployment | 5 | 10 | 5 | 0 | 7 |
| PostgreSQL DRS Migration | 4 | 3 | 3 | 0 | 7 |
| SDRS Cross-Region DR | 4 | 6 | 8 | 7 | 7 |
| Snowflake→DataArts | 4 | 3 | 2 | 1 | 6 |
| mcp-capability-builder | 7 | 2 | 1 | 0 | 0 |

## Maturity Model

| Level | Meaning | Count |
|-------|---------|-------|
| READY | Fully functional, tested, documented | 0 skills, 2 MCPs |
| READY_WITH_WARNINGS | Usable with known limitations | 4 skills, 4 MCPs |
| PARTIAL | Core workflow works, significant gaps | 1 skill |
| EXPERIMENTAL | Functional in limited scenarios | 2 skills |
| DRAFT | Initial design, not yet tested | 0 |
| BLOCKED | External dependency blocker | 0 |

## Capability Gaps

Each skill documents its capability gaps with unique IDs:

| Skill | Gap IDs | Key Gaps |
|-------|---------|----------|
| CBR | GAP-CBR-001 to 005 | No CBR MCP, no structured error handling |
| CCE | GAP-CCE-001 to 007 | No CCE discovery, no Velero tool, no K8s validation |
| DWS | GAP-DWS-001 to 007 | No DWS MCP, no error handling, password security |
| PostgreSQL DRS | GAP-PG-001 to 007 | No PG config validation, no extension compatibility |
| SDRS | GAP-SDR-001 to 007 | No SDRS CLI, no SDRS MCP (CREATE_NEW_MCP_CANDIDATE) |
| Snowflake→DataArts | GAP-DA-001 to 006 | No Snowflake extraction, no schema mapping |

Gaps are resolved via: `MANUAL_STEP`, `USE_HCLOUD_CLI`, `EXTEND_EXISTING_MCP`, `CREATE_NEW_MCP`, or `NOT_REQUIRED`.
