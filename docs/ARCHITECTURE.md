# Architecture

## Overview

The ecosystem is organized around operational skills as the primary unit of functionality. Skills orchestrate MCP servers, CLI tools, and manual steps to execute controlled, approval-gated workflows.

## 7-Layer Model

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

## Data Flow Patterns

### MCP-based Flow
```
User → Skill → MCP tool → Huawei Cloud API → Verification
```

### CLI-based Flow
```
User → Skill → hcloud CLI → Huawei Cloud → Show/List Verification
```

### Console-based Flow
```
User → Skill → Human approval → Console action → Status verification
```

### Capability Gap Flow
```
Skill → Gap detected → mcp-capability-builder → Contract → Scaffold → Tests → Review
```

## Skill-to-Mechanism Mapping

| Skill | Primary Mechanism | Required MCP | Shared Skill |
|-------|-------------------|--------------|--------------|
| CCE Cross-Region Velero | huaweicloud-deploy MCP | huaweicloud-deploy | — |
| PostgreSQL ECS→RDS DRS | huaweicloud-drs MCP | huaweicloud-drs | — |
| Snowflake→DataArts | dataarts-deploy-agent MCP | dataarts-deploy-agent | — |
| CBR Backup/Restore | hcloud CBR CLI | — | — |
| SDRS Cross-Region DR | Supervised console | — | mcp-capability-builder |
| DWS Cluster Deployment | hcloud DWS CLI | — | mcp-capability-builder |
| mcp-capability-builder | Scaffold generation | — | — |

## MCP Server Architecture

All MCP servers use stdio transport and follow the MCP protocol:

```
AI Agent (OpenCode/Hermes)
    ↕ (JSON-RPC over stdio)
MCP Server (Node.js/TypeScript/Python)
    ↕
Huawei Cloud APIs / CLI / Console
```

### Two SDK Usage Patterns

1. **Low-level SDK** (`Server` + `setRequestHandler`): Used by pricing, deploy, DRS, ticket, IIC migration MCPs
2. **High-level SDK** (`McpServer` + `server.tool`): Used by dataarts-deploy-agent (with zod schemas)
3. **Raw JSON-RPC**: Used by huawei-console-mcp (Python, hand-implemented protocol)

## Architecture Evolution

### Phase 1: MCP-Centric (2026-07-27)
- Primary deliverable: individual MCP servers
- 5 MCPs with 58 tools
- Focus: tool contracts and safety guards

### Phase 2: Skill-Centric (2026-07-29)
- Primary deliverable: operational skills
- 6 skills + 1 shared skill + 5 MCPs
- Focus: workflow orchestration and capability gap tracking
- Key insight: users want workflows, not tools

### Phase 3: Scenario-Centric (2026-08-13)
- Primary deliverable: scenario READMEs
- 6 scenarios referencing skills
- SDRS scenario split into 3 sub-skills (protection, drill, failover)
- Focus: end-to-end user journeys
