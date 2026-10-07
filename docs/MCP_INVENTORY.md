# MCP Server Inventory

| MCP | Tools | Language | SDK | Transport | Read/Write | Risk | Status | Key Dependencies |
|-----|-------|----------|-----|-----------|------------|------|--------|------------------|
| [huaweicloud-pricing](../mcps/huaweicloud-pricing/) | 25 | Node.js + Python | `@modelcontextprotocol/sdk` | stdio | 25R/0W | None | READY | axios, Python venv |
| [huaweicloud-deploy](../mcps/huaweicloud-deploy/) | 4 | Node.js | `@modelcontextprotocol/sdk` | stdio | 3R/1W | Low | READY | Terraform CLI |
| [huaweicloud-drs](../mcps/huaweicloud-drs/) | 13 | Node.js | `@modelcontextprotocol/sdk` ^1.12.1 | stdio | 10R/3W | High | READY_WITH_WARNINGS | playwright ^1.52.0 |
| [huaweicloud-ticket](../mcps/huaweicloud-ticket/) | 10 | Node.js | `@modelcontextprotocol/sdk` | stdio | 9R/1W | High | READY_WITH_WARNINGS | axios |
| [dataarts-deploy-agent](../mcps/dataarts-deploy-agent/) | 6 | Node.js | `@modelcontextprotocol/sdk` ^1.29.0 | stdio | 4R/2W | High | READY_WITH_WARNINGS | dotenv, js-yaml, zod |
| [huawei-iic-okta-migration](../mcps/huawei-iic-okta-migration/) | 10 | TypeScript | `@modelcontextprotocol/sdk` ^1.12.1 | stdio | 7R/3W | High | READY_WITH_WARNINGS | typescript ^5.8.3 |
| [huawei-console-mcp](../mcps/huawei-console-mcp/) | 12 | Python 3 | Raw JSON-RPC | stdio | 10R/2W | Medium | READY | playwright (Python) |

**Total: 81 tools across 7 MCP servers**

## Tool Detail

### huaweicloud-pricing (25 tools)

| # | Tool | Category | Risk |
|---|------|----------|------|
| 1 | QueryCloudServiceTypes | Catalog | Read-only |
| 2 | QueryResourceTypes | Catalog | Read-only |
| 3 | QueryServiceResources | Catalog | Read-only |
| 4 | QueryUsageTypes | Catalog | Read-only |
| 5 | QueryMeasurementUnits | Catalog | Read-only |
| 6 | QueryEcsFlavors | Flavor Discovery | Read-only |
| 7 | QueryRdsFlavors | Flavor Discovery | Read-only |
| 8 | QueryElbFlavors | Flavor Discovery | Read-only |
| 9 | QueryEvsVolumeTypes | Flavor Discovery | Read-only |
| 10 | QueryRdsStorageTypes | Flavor Discovery | Read-only |
| 11 | QueryElbAvailabilityZones | Flavor Discovery | Read-only |
| 12 | QueryOnDemandPrice | Pricing | Read-only |
| 13 | QueryPeriodPrice | Pricing | Read-only |
| 14 | EstimateTemplateOnDemandPrice | Pricing | Read-only |
| 15 | EstimateTemplatePeriodPrice | Pricing | Read-only |
| 16 | EstimateArchitectureOnDemandPrice | Pricing | Read-only |
| 17 | EstimateArchitecturePeriodPrice | Pricing | Read-only |
| 18 | EstimateArchitectureCostDraft | Pricing | Read-only |
| 19 | ListPricingTemplates | Templates | Read-only |
| 20 | RenderProductInfosFromTemplate | Templates | Read-only |
| 21 | ExplainRequiredTemplate | Templates | Read-only |
| 22 | EvaluateEcsFlavorAvailability | Flavor Evaluation | Read-only |
| 23 | FindEcsFlavorCandidates | Flavor Evaluation | Read-only |
| 24 | PricingHealthCheck | Utilities | Read-only |
| 25 | PricingProductInfoGuide | Utilities | Read-only |

### huaweicloud-deploy (4 tools)

| # | Tool | Risk | Key Feature |
|---|------|------|-------------|
| 1 | GenerateTerraformFromArchitecture | Low (local FS) | Generates .tf from JSON, no secrets |
| 2 | ValidateTerraformConfiguration | None | terraform fmt + init + validate |
| 3 | RunTerraformPlan | None | Preview only, apply FORBIDDEN |
| 4 | ExplainTerraformPlan | None | Analyzes plan output |

### huaweicloud-drs (13 tools)

| # | Tool | Risk | Approval |
|---|------|------|----------|
| 1 | drs_read_context | None | — |
| 2 | drs_list_tasks | None | — |
| 3 | drs_find_matching_tasks | None | — |
| 4 | drs_select_or_create_task | High | explicit_approval |
| 5 | drs_create_postgresql_full_incremental_task | High | explicit_approval |
| 6 | drs_continue_existing_task | None | — |
| 7 | drs_capture_replication_instance_eip | None | — |
| 8 | drs_generate_source_access_plan | None | — |
| 9 | drs_run_connection_test | None | — |
| 10 | drs_run_precheck | None | — |
| 11 | drs_start_task | High | explicit_approval |
| 12 | drs_get_task_status | None | — |
| 13 | drs_generate_report | None | — |

### huaweicloud-ticket (10 tools)

| # | Tool | Risk | Approval |
|---|------|------|----------|
| 1 | init_session | None | — |
| 2 | list_service_categories | None | — |
| 3 | list_issue_categories | None | — |
| 4 | get_ticket_form_schema | None | — |
| 5 | list_regions | None | — |
| 6 | list_severities | None | — |
| 7 | check_create_privilege | None | — |
| 8 | prepare_ticket | None | Dry-run |
| 9 | create_ticket | High | WARNING: real ticket |
| 10 | list_tickets | None | — |

### dataarts-deploy-agent (6 tools)

| # | Tool | Risk | Approval |
|---|------|------|----------|
| 1 | snowflake_dataarts_demo_plan | None | — |
| 2 | snowflake_dataarts_demo_run | High | confirm=true |
| 3 | snowflake_dataarts_demo_start | High | confirm=true |
| 4 | snowflake_dataarts_demo_status | None | — |
| 5 | snowflake_dataarts_demo_last_report | None | — |
| 6 | snowflake_dataarts_demo_equivalence_summary | None | — |

### huawei-iic-okta-migration (10 tools)

| # | Tool | Risk | Approval |
|---|------|------|----------|
| 1 | scim_get_user_by_username | None | — |
| 2 | scim_create_user | High | confirm=true |
| 3 | scim_get_or_create_user | High | confirm=true |
| 4 | scim_create_group | High | confirm=true |
| 5 | scim_get_group_by_display_name | None | — |
| 6 | scim_get_or_create_group | High | confirm=true |
| 7 | scim_add_members_to_group | High | confirm=true |
| 8 | migration_plan | None | — |
| 9 | migration_execute | High | confirm=true |
| 10 | migration_validate | None | — |

### huawei-console-mcp (12 tools)

| # | Tool | Category |
|---|------|----------|
| 1 | console_login | Authentication |
| 2 | console_submit_mfa | Authentication |
| 3 | console_navigate | Navigation |
| 4 | console_screenshot | Inspection |
| 5 | console_get_page_info | Inspection |
| 6 | console_click | Interaction |
| 7 | console_fill | Interaction |
| 8 | console_wait_for | Interaction |
| 9 | console_evaluate | Inspection |
| 10 | console_switch_region | Navigation |
| 11 | console_list_elements | Inspection |
| 12 | console_close | Navigation |
