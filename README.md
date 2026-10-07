# Huawei Cloud MCP Suite & Automation Skills

> A comprehensive cloud automation ecosystem: **7 MCP servers**, **7 operational skills**, **4 OpenCode skills**, and **81+ tools** for Huawei Cloud infrastructure estimation, deployment, migration, disaster recovery, and support.

## About This Project

This repository demonstrates the design and implementation of a complete **Model Context Protocol (MCP)** ecosystem for Huawei Cloud automation. It showcases expertise in:

- **Cloud infrastructure automation** (Terraform generation, pricing estimation, migration orchestration)
- **MCP server development** (Node.js, TypeScript, Python — using `@modelcontextprotocol/sdk`)
- **AI agent orchestration** (skill-based workflows, approval gates, capability gap analysis)
- **Security-first design** (read/write separation, explicit approval gates, secret scrubbing, CIDR enforcement)
- **Multi-paradigm architecture** (MCP-centric → skill-centric → scenario-centric evolution)

---

## Repository Structure

```
huaweicloud-deploy-mcp/
├── mcps/                              # 7 MCP Servers (81+ tools total)
│   ├── huaweicloud-pricing/           # 25 read-only pricing & catalog tools
│   ├── huaweicloud-deploy/            # 4 Terraform generation & validation tools
│   ├── huaweicloud-drs/               # 13 DRS database migration tools (Playwright)
│   ├── huaweicloud-ticket/            # 10 service ticket management tools
│   ├── dataarts-deploy-agent/         # 6 Snowflake→DataArts migration tools
│   ├── huawei-iic-okta-migration/     # 10 Okta→Huawei IIC SCIM migration tools (TypeScript)
│   └── huawei-console-mcp/            # 12 console browser automation tools (Python)
│
├── skills/                            # 7 Operational Skills
│   ├── huawei-cbr-backup-restore/     # CBR backup & restore (hcloud CLI)
│   ├── huawei-cce-cross-region-velero-migration/  # CCE cross-region (Velero)
│   ├── huawei-dws-cluster-deployment/ # DWS data warehouse deployment
│   ├── huawei-postgresql-ecs-to-rds-drs-cross-region/  # PostgreSQL DRS migration
│   ├── huawei-sdr-cross-region-replication/  # SDRS disaster recovery
│   ├── huawei-snowflake-to-dataarts-migration/  # Snowflake→DataArts migration
│   └── mcp-capability-builder/        # Gap analysis & MCP scaffold generation
│
├── opencode-skills/                   # 4 OpenCode Agent Skills
│   ├── codearts-cicd/                 # CI/CD pipeline automation (CodeArts)
│   ├── outlook-email/                 # Email management (IMAP/SMTP)
│   ├── postman-to-codearts/           # Postman→CodeArts TestPlan conversion
│   └── huawei-console-login/          # Console login with MFA & captcha solver
│
├── docs/                              # Architecture & methodology documentation
│   ├── ARCHITECTURE.md               # System architecture (7-layer model)
│   ├── AI_METHODOLOGY.md             # AI-assisted development methodology
│   ├── SECURITY.md                   # Security guidelines & practices
│   ├── MCP_INVENTORY.md              # Complete MCP server inventory
│   └── SKILLS_INVENTORY.md           # Complete skills inventory
│
├── server.mjs                         # Root deploy MCP (backward compatible)
├── terraform-generator.mjs            # Terraform code generation
├── terraform-executor.mjs             # Terraform CLI execution (plan only)
├── architecture-validator.mjs         # Architecture definition validation
├── plan-analyzer.mjs                  # Terraform plan analysis
├── Dockerfile                         # Docker image for deploy MCP
└── config/                            # Supported services configuration
```

---

## MCP Servers

### 1. huaweicloud-pricing (25 tools — read-only)

Pricing estimation and product catalog queries. All tools are **read-only** with zero risk of resource modification.

| Category | Tools | Purpose |
|----------|-------|---------|
| Product Catalog | `QueryCloudServiceTypes`, `QueryResourceTypes`, `QueryServiceResources`, `QueryUsageTypes`, `QueryMeasurementUnits` | Explore Huawei Cloud product catalog |
| Flavor Discovery | `QueryEcsFlavors`, `QueryRdsFlavors`, `QueryElbFlavors`, `QueryEvsVolumeTypes`, `QueryRdsStorageTypes`, `QueryElbAvailabilityZones` | Query available flavors and specs |
| Price Estimation | `QueryOnDemandPrice`, `QueryPeriodPrice`, `EstimateTemplateOnDemandPrice`, `EstimateTemplatePeriodPrice`, `EstimateArchitectureOnDemandPrice`, `EstimateArchitecturePeriodPrice` | Real price queries via BSS/OCE API |
| Template System | `ListPricingTemplates`, `RenderProductInfosFromTemplate`, `EstimateArchitectureCostDraft`, `ExplainRequiredTemplate` | Parametric pricing templates |
| Flavor Evaluation | `EvaluateEcsFlavorAvailability`, `FindEcsFlavorCandidates` | Multi-AZ flavor availability validation |
| Utilities | `PricingHealthCheck`, `PricingProductInfoGuide` | Configuration validation |

**Tech stack:** Node.js (ESM) + Python helpers | `@modelcontextprotocol/sdk` + `axios` | Huawei Cloud BSS/OCE, ECS, RDS, ELB, EVS APIs

**Key pattern:** Template-based architecture cost estimation — 20+ service templates (ECS, EVS, EIP, ELB, RDS, OBS, HSS, CBR, CFW, DCS, DDS, LTS, NAT, SFS, VPC, VPN, WAF) with parametric `product_infos` rendering.

### 2. huaweicloud-deploy (4 tools — infrastructure-write, low risk)

Terraform generation, validation, and planning. **Never applies changes** — `terraform apply`/`destroy` explicitly forbidden.

| Tool | Purpose |
|------|---------|
| `GenerateTerraformFromArchitecture` | Generate `.tf` files from architecture JSON (no cloud resources created) |
| `ValidateTerraformConfiguration` | Run `terraform fmt`, `init`, `validate` |
| `RunTerraformPlan` | Run `terraform plan` (preview only, no apply) |
| `ExplainTerraformPlan` | Analyze and explain the most recent plan |

**Supported services:** VPC, Subnet, Security Group, ECS, ELB, EIP, RDS MySQL, OBS, ELB Backend Attachment

**Key pattern:** `FORBIDDEN_COMMANDS` array blocks `terraform apply`/`destroy` at the executor level. No secrets injected into `.tf` files. Workspace-based isolation (each architecture gets its own directory).

### 3. huaweicloud-drs (13 tools — migration-write, high risk)

DRS (Data Replication Service) task management with Playwright-based console automation. Primarily for PostgreSQL self-managed on ECS → RDS for PostgreSQL, cross-region via public EIP.

| Category | Tools |
|----------|-------|
| Read | `drs_read_context`, `drs_list_tasks`, `drs_find_matching_tasks`, `drs_continue_existing_task`, `drs_capture_replication_instance_eip`, `drs_get_task_status`, `drs_generate_report` |
| Write (approval required) | `drs_select_or_create_task`, `drs_create_postgresql_full_incremental_task`, `drs_start_task` |
| Validation | `drs_generate_source_access_plan`, `drs_run_connection_test`, `drs_run_precheck` |

**Tech stack:** Node.js (ESM) + Playwright | `@modelcontextprotocol/sdk` ^1.12.1 + `playwright` ^1.52.0

**Key pattern:** Safety guards reject `0.0.0.0/0` and CIDRs broader than `/32`. Task deduplication (EXACT_MATCH/PARTIAL_MATCH/NAME_ONLY_MATCH/NOT_MATCHING). `explicit_approval=true` required on all write operations.

### 4. huaweicloud-ticket (10 tools — support-write, high risk)

Service ticket creation and management through Huawei Cloud console ticket API.

| Category | Tools |
|----------|-------|
| Session | `init_session`, `check_create_privilege` |
| Catalog Discovery | `list_service_categories`, `list_issue_categories`, `get_ticket_form_schema`, `list_regions`, `list_severities` |
| Ticket Operations | `prepare_ticket` (dry-run), `create_ticket` (write), `list_tickets` |

**Key pattern:** `prepare_ticket` before `create_ticket` — review the payload before submitting a real ticket. Dynamic form schema discovery. Session management via console cookies + CSRF token.

### 5. dataarts-deploy-agent (6 tools — deployment-write, high risk)

Snowflake-to-DataArts migration demo agent with one-shot plan/run workflows and equivalence validation.

| Tool | Purpose |
|------|---------|
| `snowflake_dataarts_demo_plan` | Read-only one-shot plan |
| `snowflake_dataarts_demo_run` | Synchronous full demo (`confirm=true` required) |
| `snowflake_dataarts_demo_start` | Async demo start (for long-running jobs) |
| `snowflake_dataarts_demo_status` | Check async demo status |
| `snowflake_dataarts_demo_last_report` | Get last run report |
| `snowflake_dataarts_demo_equivalence_summary` | Snowflake vs DataArts equivalence validation |

**Tech stack:** Node.js (CommonJS) | `@modelcontextprotocol/sdk` ^1.29.0 + `dotenv` + `js-yaml` + `zod`

**Key pattern:** `scrubSecrets()` in all output. SQL dialect adaptation (Snowflake→DLI). Multiple adapters: legacy-demo, native-dli, koocli, runtime-engine. Stale result detection. 40+ supporting modules.

### 6. huawei-iic-okta-migration (10 tools — identity-write, high risk)

Migrate Okta users, groups, and memberships into Huawei IAM Identity Center using direct SCIM operations.

| Category | Tools |
|----------|-------|
| User Operations | `scim_get_user_by_username`, `scim_create_user`, `scim_get_or_create_user` |
| Group Operations | `scim_create_group`, `scim_get_group_by_display_name`, `scim_get_or_create_group` |
| Membership | `scim_add_members_to_group` |
| Migration Orchestration | `migration_plan`, `migration_execute`, `migration_validate` |

**Tech stack:** TypeScript (compiled to JS) | `@modelcontextprotocol/sdk` ^1.12.1 | SCIM 2.0 protocol

**Key pattern:** Idempotent operations. State checkpoint after every step. Evidence logging as NDJSON. DRY_RUN by default. Never uses Okta internal IDs as SCIM IDs (the key insight that makes this work where Okta Group Push fails).

### 7. huawei-console-mcp (12 tools — browser automation)

Python-based MCP server for Huawei Cloud Console browser automation with login, MFA, and captcha handling.

| Category | Tools |
|----------|-------|
| Authentication | `console_login`, `console_submit_mfa` |
| Navigation | `console_navigate`, `console_switch_region`, `console_close` |
| Interaction | `console_click`, `console_fill`, `console_wait_for`, `console_select_option` |
| Inspection | `console_screenshot`, `console_get_page_info`, `console_list_elements`, `console_evaluate` |

**Tech stack:** Python 3 + Playwright (Python async API) | Hand-implemented JSON-RPC over stdio (MCP protocol `2024-11-05`)

**Key pattern:** Raw JSON-RPC implementation without MCP SDK library. Multi-selector fallback strategies for login form. Session persistence via cookies/state files.

---

## Operational Skills

Each skill is a self-contained workflow with phases, approval gates, capability gap tracking, and validation.

| Skill | Domain | Scenario | Status | Risk | Mechanism | Phases |
|-------|--------|----------|--------|------|-----------|--------|
| [huawei-cbr-backup-restore](skills/huawei-cbr-backup-restore/) | Cloud Foundation | CBR backup & restore | READY_WITH_WARNINGS | High | hcloud CLI | 14 |
| [huawei-cce-cross-region-velero-migration](skills/huawei-cce-cross-region-velero-migration/) | Migration | CCE cross-region (Velero) | EXPERIMENTAL | High | deploy MCP | 10 |
| [huawei-dws-cluster-deployment](skills/huawei-dws-cluster-deployment/) | Big Data | DWS cluster deployment | READY_WITH_WARNINGS | High | hcloud CLI | 20 |
| [huawei-postgresql-ecs-to-rds-drs-cross-region](skills/huawei-postgresql-ecs-to-rds-drs-cross-region/) | Migration | PostgreSQL ECS→RDS DRS | READY_WITH_WARNINGS | High | DRS MCP | 10 |
| [huawei-sdr-cross-region-replication](skills/huawei-sdr-cross-region-replication/) | Cloud Foundation | SDRS cross-region DR | EXPERIMENTAL | Critical | Supervised console | 18 |
| [huawei-snowflake-to-dataarts-migration](skills/huawei-snowflake-to-dataarts-migration/) | Migration | Snowflake→DataArts | PARTIAL | Medium | dataarts MCP | 10 |
| [mcp-capability-builder](skills/mcp-capability-builder/) | Shared | Gap analysis & scaffold | READY_WITH_WARNINGS | Low | Local files | 10 |

### Skill Structure

Every skill follows a consistent structure:

```
skill-name/
├── SKILL.md                    # Operational instructions for AI agent
├── README.md                   # Human-readable documentation
├── skill.yaml                  # Machine-readable manifest
├── mcp-dependencies.yaml       # MCP tool mapping
├── docs/                       # Architecture, prerequisites, runbooks, validation, rollback
├── workflows/                  # Phase-specific workflow definitions
├── prompts/                    # Ready-to-use prompts per phase
├── examples/                   # Usage examples
└── tests/                      # Validation tests
```

---

## OpenCode Agent Skills

Lightweight skills for the OpenCode AI agent TUI, triggered by keyword matching.

| Skill | Purpose | Tools | Key Feature |
|-------|---------|-------|-------------|
| [codearts-cicd](opencode-skills/codearts-cicd/) | CI/CD pipeline automation | 8 | Pipeline creation, merge triggers, webhook verification, SWR image tags |
| [outlook-email](opencode-skills/outlook-email/) | Email management | 7 | IMAP/SMTP, multi-provider support, always confirm before sending |
| [postman-to-codearts](opencode-skills/postman-to-codearts/) | Postman→CodeArts conversion | 1 (transform.py) | 7-step transform pipeline, quality checks, suite classification |
| [huawei-console-login](opencode-skills/huawei-console-login/) | Console authentication | 2 (Python) | OpenCV captcha solver, MFA handling, human-like drag simulation |

---

## Architecture

### 7-Layer Model

```
┌─────────────────────────────────────────────────────┐
│                    Domain Navigation                │
│  Cloud Foundation | Big Data | Migration           │
├─────────────────────────────────────────────────────┤
│                     Operational Skills              │
│  CBR | SDRS | DWS | CCE | PostgreSQL | DataArts    │
├─────────────────────────────────────────────────────┤
│                       Shared Skills                 │
│               mcp-capability-builder                │
├─────────────────────────────────────────────────────┤
│                   Execution Mechanisms              │
│  MCP Tools | hcloud CLI | Console | Manual Steps   │
├─────────────────────────────────────────────────────┤
│                       MCP Layer                     │
│  Pricing | Deploy | DRS | Ticket | DataArts | IIC  │
├─────────────────────────────────────────────────────┤
│                   Integration Layer                 │
│                      Playwright                     │
├─────────────────────────────────────────────────────┤
│                   Shared Infrastructure             │
│  Docs | Schemas | Templates | Tests | Inventories  │
└─────────────────────────────────────────────────────┘
```

### Architecture Evolution

| Phase | Date | Paradigm | Primary Unit | Key Insight |
|-------|------|----------|--------------|-------------|
| 1 | 2026-07-27 | MCP-centric | Individual MCP server | Tools as primary deliverable |
| 2 | 2026-07-29 | Skill-centric | Operational skill | Skills orchestrate MCPs; MCPs are mechanisms |
| 3 | 2026-08-13 | Scenario-centric | Scenario README | Scenarios orchestrate skills for end-to-end workflows |

The evolution demonstrates progressive architectural maturity: from building individual tools → to orchestrating them into workflows → to packaging them as user-facing scenarios.

---

## Security Practices

### Read/Write Separation

| MCP | Read-Only | Write (approval required) | Risk |
|-----|-----------|---------------------------|------|
| huaweicloud-pricing | 25 | 0 | None |
| huaweicloud-deploy | 3 | 1 (local FS only) | Low |
| huaweicloud-drs | 10 | 3 (`explicit_approval`) | High |
| huaweicloud-ticket | 9 | 1 (`create_ticket`) | High |
| dataarts-deploy-agent | 4 | 2 (`confirm=true`) | High |
| huawei-iic-okta-migration | 7 | 3 (`confirm=true`) | High |
| huawei-console-mcp | 10 | 2 (login, fill) | Medium |

### Core Security Principles

1. **Explicit approval gates** — All write operations require `explicit_approval=true` or `confirm=true`
2. **DISCOVER BEFORE CREATE** — Never hardcode resource IDs; always discover first
3. **VERIFY AFTER EVERY STEP** — Every write has a follow-up read verification
4. **Secret scrubbing** — `scrubSecrets()` removes AK/SK, tokens, passwords from all output
5. **CIDR enforcement** — DRS rejects `0.0.0.0/0` and CIDRs broader than `/32`
6. **No credentials in code** — Environment variables only; `.env` files in `.gitignore`
7. **Dry-run by default** — All write tools default to dry-run/preview mode
8. **No destructive automation** — `terraform apply`/`destroy` explicitly forbidden in code

---

## AI-Assisted Development Methodology

This project was developed using an AI-assisted methodology that combines human architectural decisions with AI-generated implementation. See [docs/AI_METHODOLOGY.md](docs/AI_METHODOLOGY.md) for full details.

### Key Principles

- **Human designs architecture, AI implements** — All architectural decisions (layer model, skill structure, security patterns) were human-driven
- **AI generates boilerplate, human reviews** — Tool definitions, error handling, test scaffolds generated by AI, reviewed and refined by human
- **Evidence-based maturity** — Every skill status is backed by test results, not aspiration
- **Capability gap tracking** — Missing automation explicitly documented with gap IDs and resolutions
- **Iterative refinement** — `.bak` files show evolution; each iteration improved safety, completeness, or usability

### Tools Used

| Tool | Role |
|------|------|
| OpenCode + GLM-5.2 | Primary AI agent for MCP development, skill authoring, and documentation |
| `@modelcontextprotocol/sdk` | MCP protocol implementation (Node.js/TypeScript) |
| Playwright | Browser automation for DRS console and Huawei Cloud console |
| Terraform | Infrastructure-as-code generation target |
| hcloud CLI | Huawei Cloud CLI for CBR, DWS, and discovery operations |

---

## Technology Stack Summary

| Component | Technology | Purpose |
|-----------|-----------|---------|
| MCP Servers (5) | Node.js (ESM) + `@modelcontextprotocol/sdk` | Pricing, deploy, DRS, ticket, DataArts |
| MCP Server (1) | TypeScript → JS + `@modelcontextprotocol/sdk` | Okta→Huawei IIC SCIM migration |
| MCP Server (1) | Python 3 + Playwright (raw JSON-RPC) | Console browser automation |
| Pricing helpers | Python 3 + Huawei Cloud SDKs | BSS/OCE API calls |
| Skills | YAML manifests + Markdown instructions | AI agent workflow orchestration |
| OpenCode skills | Markdown with frontmatter | Keyword-triggered agent capabilities |
| Infrastructure | Terraform (generated, not applied) | Huawei Cloud IaC |
| Browser automation | Playwright (Node.js + Python) | DRS console, Huawei Cloud console |
| Docker | Dockerfile + GHCR | Containerized deploy MCP |

---

## Getting Started

### Prerequisites

- Node.js >= 18
- Python 3 >= 3.10 (for pricing helpers and console MCP)
- Terraform CLI >= 1.5 (for huaweicloud-deploy)
- Playwright Chromium (`npx playwright install chromium`)
- Huawei Cloud account with AK/SK credentials

### Install an MCP Server

```bash
cd mcps/huaweicloud-pricing
npm install
```

### Run Tests

```bash
# Pricing (unit tests, no credentials needed)
cd mcps/huaweicloud-pricing && npm run test:unit

# Deploy
cd mcps/huaweicloud-deploy && npm test

# DRS
cd mcps/huaweicloud-drs && npm test
```

### Docker (Deploy MCP)

```bash
docker pull ghcr.io/magozcab/huaweicloud-deploy-mcp:latest
docker run -e HWCLOUD_ACCESS_KEY=... -e HWCLOUD_SECRET_KEY=... ghcr.io/magozcab/huaweicloud-deploy-mcp:latest
```

---

## Key Achievements

- **81+ MCP tools** across 7 servers covering pricing, deployment, migration, DR, ticketing, identity, and console automation
- **6 operational skills** with 10-20 phases each, covering cloud foundation, big data, and migration domains
- **672+ test assertions** across all MCPs and skills (0 critical security findings)
- **20+ pricing templates** for parametric cost estimation across Huawei Cloud services
- **3 architectural paradigms** evolved over 3 releases (MCP → skill → scenario)
- **Zero credentials** in any committed file — security-first design throughout
- **Cross-region migration** support (PostgreSQL ECS→RDS, CCE Velero, SDRS DR)
- **Snowflake→DataArts** SQL dialect adaptation with equivalence validation
- **Okta→Huawei IIC** SCIM migration solving the Okta Group Push ID mismatch problem

---

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — 7-layer model, data flows, skill-to-mechanism mapping
- [AI Methodology](docs/AI_METHODOLOGY.md) — How AI was used to develop this ecosystem
- [Security](docs/SECURITY.md) — Security guidelines, read/write separation, approval gates
- [MCP Inventory](docs/MCP_INVENTORY.md) — Complete MCP server inventory with tool counts
- [Skills Inventory](docs/SKILLS_INVENTORY.md) — Complete skills inventory with automation summary

---

## License

MIT License — see [LICENSE](LICENSE)

---

## Author

**Marco Antonio Gomez**  
Cloud automation engineer specializing in MCP server development, Huawei Cloud infrastructure, and AI-assisted cloud migration workflows.
