# AI-Assisted Development Methodology

This document describes the methodology used to develop the Huawei Cloud MCP Suite and operational skills ecosystem. It demonstrates how AI agents were used as development partners while maintaining human control over architectural decisions, security, and quality.

---

## 1. Methodology Overview

### Core Principle: Human Architects, AI Implements

The development followed a **human-in-the-loop AI-assisted** methodology:

- **Human decisions:** Architecture, security model, tool contracts, approval gates, domain decomposition
- **AI implementation:** Tool handlers, error handling, test scaffolds, documentation, boilerplate
- **Human review:** Every AI-generated artifact was reviewed before integration
- **Evidence-based validation:** All claims verified through tests, not aspiration

### Development Loop

```
Human defines requirement
        ↓
Human designs tool contract (name, parameters, return type)
        ↓
AI generates implementation scaffold
        ↓
Human reviews and refines
        ↓
AI generates test scaffold
        ↓
Human reviews and adds edge cases
        ↓
Run tests → fix → iterate
        ↓
Human documents capability gaps
        ↓
AI generates documentation
        ↓
Human reviews and publishes
```

---

## 2. AI Agent Configuration

### Primary AI Agent: OpenCode + GLM-5.2

The development environment used [OpenCode](https://opencode.ai) as the AI agent TUI, configured with Huawei Cloud MaaS (Model as a Service) providing the GLM-5.2 language model.

```jsonc
{
  "model": "huaweicloud-maas/glm-5.2",
  "mcpServers": {
    "huaweicloud-pricing": { "command": "node", "args": ["mcps/huaweicloud-pricing/src/server.mjs"] },
    "huaweicloud-deploy": { "command": "node", "args": ["mcps/huaweicloud-deploy/src/server.mjs"] },
    "huaweicloud-drs": { "command": "node", "args": ["mcps/huaweicloud-drs/src/server.mjs"] },
    "huaweicloud-ticket": { "command": "node", "args": ["mcps/huaweicloud-ticket/src/server.mjs"] },
    "dataarts-deploy-agent": { "command": "node", "args": ["mcps/dataarts-deploy-agent/src/mcp-server.mjs"] }
  }
}
```

### How MCP Servers Enable AI Cloud Operations

The MCP servers act as **structured tool interfaces** between the AI agent and Huawei Cloud APIs:

```
User: "Estimate the cost of 3 ECS instances with 4 vCPU and 8GB RAM in la-north-2"
                    ↓
AI Agent (GLM-5.2) parses intent
                    ↓
AI Agent calls MCP tool: EstimateArchitectureOnDemandPrice
    with components: [{ service: "ecs", template_id: "ecs-payg", quantity: 3, parameters: { vcpus: 4, ram_gb: 8 } }]
                    ↓
MCP server renders product_infos from template
                    ↓
MCP server calls Huawei Cloud BSS/OCE pricing API
                    ↓
MCP server returns structured price response
                    ↓
AI Agent formats response for user
```

The AI agent never directly calls Huawei Cloud APIs. All cloud interactions go through MCP tools with defined contracts, safety guards, and approval gates.

---

## 3. MCP Development Pattern

### 3.1 Tool Contract Definition (Human)

Before any code is written, the human defines the tool contract:

```javascript
// Human defines: tool name, description, input schema, output contract
{
  name: "EstimateArchitectureOnDemandPrice",
  description: "Estimate on-demand pricing for an architecture composed of multiple local pricing templates.",
  inputSchema: {
    components: [{ service: "string", template_id: "string", quantity: "number", parameters: "object" }],
    region: "string",
    validate_availability: "boolean"
  },
  outputContract: "Structured price breakdown per component + monthly total",
  risk: "read-only",
  approvalRequired: false
}
```

### 3.2 Implementation Scaffold (AI-Generated, Human-Reviewed)

The AI agent generates the implementation based on the contract:

```javascript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "EstimateArchitectureOnDemandPrice") {
    const { components, region } = request.params.arguments;
    // AI generates: parameter validation, API call, response formatting
    // Human reviews: error handling, secret scrubbing, edge cases
  }
});
```

### 3.3 Safety Guard Pattern

Every write tool includes an approval gate:

```javascript
// Pattern repeated across all write tools
if (!explicit_approval) {
  return {
    content: [{
      type: "text",
      text: "This operation requires explicit_approval=true to proceed."
    }]
  };
}
```

### 3.4 Test Scaffold (AI-Generated, Human-Extended)

```javascript
// AI generates basic test scaffold
test('rejects 0.0.0.0/0 CIDR', () => {
  const result = validateCIDR('0.0.0.0/0');
  assert.strictEqual(result.valid, false);
});

// Human adds edge cases
test('rejects CIDR broader than /32', () => {
  assert.strictEqual(validateCIDR('10.0.0.0/24').valid, false);
  assert.strictEqual(validateCIDR('10.0.0.0/31').valid, false);
  assert.strictEqual(validateCIDR('10.0.0.0/32').valid, true);
});
```

---

## 4. Skill Development Pattern

### 4.1 Skill Design (Human)

The human designs the skill workflow:

1. **Define scenario** — What cloud operation does this skill automate?
2. **Identify phases** — What are the sequential steps?
3. **Map mechanisms** — Which MCP tools, CLI commands, or manual steps per phase?
4. **Identify gaps** — What automation is missing?
5. **Define maturity** — What evidence supports the status claim?

### 4.2 SKILL.md Generation (AI-Assisted)

The AI agent helps generate the SKILL.md operational instructions based on the human's design:

```markdown
## Phase 1: Discovery (AUTOMATED)

**Goal:** Discover existing resources before creating new ones.

**Steps:**
1. Call `drs_list_tasks` to find existing DRS tasks
2. Call `drs_find_matching_tasks` to classify matches
3. If EXACT_MATCH found → reuse (REUSE BEFORE CREATE)
4. If PARTIAL_MATCH found → present to user for decision
5. If NOT_MATCHING → proceed to creation

**Verification:** Task list is non-empty and matches are classified.
```

### 4.3 Capability Gap Tracking

Every skill explicitly documents what it cannot do:

```yaml
capability_gaps:
  - id: GAP-PG-001
    description: "No PostgreSQL configuration validation"
    impact: "Cannot verify pg_hba.conf before DRS connection"
    resolution: MANUAL_STEP
    future: "Could be automated with a new MCP tool"
    
  - id: GAP-PG-004
    description: "VPN connectivity not supported"
    impact: "DRS uses public EIP instead of VPN"
    resolution: NOT_REQUIRED
    rationale: "EIP architecture is the supported design for this scenario"
```

---

## 5. Architecture Decision Records

### ADR-1: MCP-Centric → Skill-Centric Evolution

**Context:** Initial delivery packaged 5 MCP servers as primary deliverables.

**Decision:** Reorganize to skill-centric architecture where skills are primary and MCPs are execution mechanisms.

**Rationale:** Users don't want "25 pricing tools" — they want "estimate the cost of my architecture." Skills provide the workflow; MCPs provide the tools.

**Consequence:** Clearer separation of concerns. Skills document the full workflow; MCPs focus on tool contracts. Added `mcp-dependencies.yaml` to each skill.

### ADR-2: Explicit Approval Gates on All Write Operations

**Context:** DRS task creation starts real database replication. Ticket creation submits real tickets.

**Decision:** All write operations require `explicit_approval=true` or `confirm=true` boolean parameter.

**Rationale:** AI agents should never perform irreversible cloud operations without human confirmation. The approval gate is at the tool level, not the agent level — even a misconfigured agent cannot bypass it.

**Consequence:** Two-phase pattern: dry-run/prepare → review → confirm → execute.

### ADR-3: terraform apply Forbidden in Code

**Context:** The deploy MCP generates Terraform configurations. Should it also apply them?

**Decision:** `terraform apply` and `terraform destroy` are in a `FORBIDDEN_COMMANDS` array at the executor level.

**Rationale:** Infrastructure deployment should always be a conscious human decision. The MCP's job is to generate and validate; the human's job is to review and apply.

**Consequence:** The MCP is classified as "low risk" despite generating infrastructure code. Users must manually `cd workspace && terraform apply`.

### ADR-4: Playwright for DRS (Not REST API)

**Context:** DRS v5 task creation API requires complex console-specific authentication.

**Decision:** Use Playwright browser automation for DRS task creation instead of REST API.

**Rationale:** The DRS console uses internal APIs with session-based auth that are not publicly documented. Playwright provides a reliable automation path.

**Consequence:** Added `playwright` as a dependency. Browser automation is more fragile than API calls but works without undocumented internal APIs. Safety guards (CIDR checks, approval gates) are still enforced at the MCP level.

### ADR-5: SCIM for Okta→Huawei IIC Migration

**Context:** Okta Group Push fails because it uses Okta internal user IDs instead of Huawei SCIM user IDs.

**Decision:** Build a dedicated MCP that performs SCIM operations directly: resolve user by userName → create if missing → store Huawei SCIM ID → resolve/create group → PATCH membership with Huawei IDs.

**Rationale:** The ID mismatch is the root cause of Okta Group Push failure. Direct SCIM operations with proper ID resolution solve this permanently.

**Consequence:** The `huawei-iic-okta-migration` MCP was built with idempotent operations, state checkpointing, and evidence logging. It replaces the failed Okta Group Push approach entirely.

---

## 6. Testing Strategy

### Test Pyramid

```
                    ┌─────────┐
                    │  E2E    │  (requires credentials, manual)
                    └─────────┘
                  ┌─────────────┐
                  │ Integration │  (requires credentials, CI-skipped)
                  └─────────────┘
                ┌───────────────────┐
                │     Unit Tests    │  (no credentials, always run)
                └───────────────────┘
              ┌───────────────────────────┐
              │  Safety Guard Tests       │  (no credentials, always run)
              └───────────────────────────┘
            ┌───────────────────────────────┐
            │  Structure/Navigation Tests    │  (no credentials, always run)
            └───────────────────────────────┘
```

### Test Results (672+ assertions)

| Suite | Assertions | Status |
|-------|-----------|--------|
| Global navigation | 208 | PASS |
| CBR structure | 27 | PASS |
| SDRS structure | 40 | PASS |
| DWS structure | 45 | PASS |
| CCE structure | 16 | PASS |
| PostgreSQL DRS structure | 18 | PASS |
| Snowflake DataArts structure | 17 | PASS |
| DRS dryRun | 12 | PASS |
| DRS taskMatcher | 20 | PASS |
| DRS safetyGuards | 26 | PASS |
| Deploy no-apply | 15 | PASS |
| Deploy no-secrets | 11 | PASS |
| Deploy validation | 15 | PASS |
| Ticket approval guard | 7 | PASS |
| Pricing (21 test files) | ~50 | PASS |

---

## 7. Maturity Model

Every component is classified by evidence-based maturity:

| Level | Meaning | Components at this level |
|-------|---------|------------------------|
| READY | Fully functional, tested, documented | huaweicloud-pricing, huaweicloud-deploy |
| READY_WITH_WARNINGS | Usable with known limitations | huaweicloud-drs, huaweicloud-ticket, dataarts-deploy-agent, CBR, DWS, PG-DRS, mcp-capability-builder |
| PARTIAL | Core workflow works, significant gaps | Snowflake→DataArts |
| EXPERIMENTAL | Functional in limited scenarios | CCE Velero, SDRS |
| DRAFT | Initial design, not yet tested | (none currently) |
| BLOCKED | External dependency blocker | (none currently) |

Maturity is **never aspirational** — it is always backed by test results and documented evidence.

---

## 8. Lessons Learned

### 8.1 Skills > MCPs for User Value

Users think in terms of scenarios ("migrate my database"), not tools ("call DRS API"). Packaging as skills with clear workflows provides more value than packaging as individual tools.

### 8.2 Approval Gates Must Be at Tool Level

Putting approval gates at the agent level is insufficient — a misconfigured agent can bypass them. Putting them at the MCP tool level (as required parameters) ensures they cannot be bypassed.

### 8.3 Capability Gaps Are Features, Not Bugs

Explicitly documenting what a skill cannot do is as valuable as documenting what it can do. It sets correct expectations and identifies future development opportunities.

### 8.4 Read-Only Tools Enable Safe Exploration

The pricing MCP's 25 read-only tools allow AI agents to explore Huawei Cloud's catalog, flavors, and pricing without any risk. This enables "discover before create" as a first-class workflow pattern.

### 8.5 Browser Automation Is Fragile but Necessary

When no public API exists (DRS console), Playwright automation is the only option. Safety guards at the MCP level compensate for the fragility of browser-based interactions.

### 8.6 Template-Based Pricing Is Powerful

Parametric pricing templates (`product_infos_template` + parameters → `product_infos`) enable architecture-level cost estimation without hardcoding product specifications. This pattern could be extended to other cloud providers.

---

## 9. AI Agent as Development Partner

### What the AI Agent Did

- Generated MCP tool handler scaffolds based on tool contracts
- Generated test scaffolds based on tool definitions
- Generated documentation (README, SKILL.md, architecture docs)
- Generated YAML manifests (skill.yaml, mcp-dependencies.yaml)
- Performed codebase exploration and summarization
- Generated migration reports and equivalence summaries
- Assisted with debugging (reading error messages, suggesting fixes)

### What the Human Did

- Designed the 7-layer architecture model
- Defined all tool contracts (names, parameters, return types)
- Designed the security model (approval gates, CIDR enforcement, secret scrubbing)
- Made all architectural decisions (ADRs 1-5)
- Reviewed and refined every AI-generated artifact
- Defined the maturity model and evidence requirements
- Identified and documented all capability gaps
- Designed the skill workflow phases and approval gates
- Verified all security claims (0 credentials in committed files)

### Why This Division

The AI excels at:
- Generating boilerplate code from specifications
- Maintaining consistency across similar patterns
- Generating comprehensive test cases
- Documenting existing code

The human excels at:
- Making architectural trade-off decisions
- Designing security boundaries
- Understanding user intent and workflow design
- Evaluating evidence vs aspiration
- Making "should we do this?" decisions

---

## 10. Reproducibility

This entire ecosystem was developed in a Linux environment with:

- OpenCode AI agent (TUI) with GLM-5.2 model via Huawei Cloud MaaS
- Node.js 18+ for MCP servers
- Python 3.10+ for pricing helpers and console MCP
- Terraform 1.5+ for deploy MCP
- Playwright for browser automation
- Huawei Cloud account with AK/SK credentials

The development process is reproducible: install the prerequisites, configure the MCP servers in OpenCode, and the AI agent can assist with extending the ecosystem following the same patterns documented here.
