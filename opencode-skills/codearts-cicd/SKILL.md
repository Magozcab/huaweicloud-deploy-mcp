---
name: codearts-cicd
description: Use when the user wants to create, run, or manage CI/CD pipelines in Huawei Cloud CodeArts, automate builds, configure merge triggers, check pipeline status, update build tags, or verify webhooks. Triggers on keywords like pipeline, build, codearts, CI/CD, deploy, merge trigger, auto build, webhook, SWR image, build tag.
---

# CodeArts CI/CD Pipeline Automation

You have access to the `codearts-cicd` MCP server which automates CodeArts Pipeline and Build operations via `hcloud` CLI.

## Architecture State (READ FIRST on every session)

**File:** `/root/repoproject/CICD_ARCHITECTURE.md`

On session start, read the `## STATUS SUMMARY` section of `CICD_ARCHITECTURE.md`. It contains tagged status lines like `[NONPROD-PIPE-BE] DONE` or `[PREPROD-REPO] PENDING`. Use these to:
1. Know what's already configured (skip re-doing)
2. Know what's next in the execution plan (Section 8)
3. Find key IDs quickly (Section 9)

**After completing any step**, update the corresponding tag from `PENDING` to `DONE` in `CICD_ARCHITECTURE.md`.

## Project Context

| Resource | Value |
|---|---|
| Project | ANH-fiscalizacion-2025 |
| Project ID | `2362299f9a1749fdb8e35bd66b4a4140` |
| Domain ID | `71d8bb27e33e482a8af901b99786d1b8` |
| Region | `la-north-2` |
| Repo | `anh-ingestion-zone` (ID: `7535151`) |
| Backend Build | `38ad6ace750d42be8386a802ce43c8e7` |
| Frontend Build | `cfe868d3d60f4c0dbd960a471a58720b` |
| Unit Tests Build | `637393b41b394e638cf342574e1a04fe` |
| Existing Pipeline (Backend) | `79ec5b91e3a34507ae13aa7b77058c48` (merge-dev-to-main-gate) |
| Existing Pipeline (Frontend) | `a89fac83df3e4d88b65e3b083bad5c76` (merge-dev-to-main-gate-frontend) |

## Available Tools

| Tool | Purpose |
|---|---|
| `create_pipeline` | Create pipeline with merge trigger + Build step + path filter |
| `run_pipeline` | Execute a pipeline by ID (branch + event_type) |
| `get_pipeline_status` | Check pipeline run status and stage results |
| `list_builds` | List build jobs and execution history |
| `update_build_tag` | Change Docker image tag to dynamic format |
| `enable_auto_build` | Toggle is_auto_build (needs Maintainer role) |
| `check_webhook` | Verify pipeline webhook in repo |
| `list_pipeline_plugins` | List available pipeline step plugins |

## Common Workflows

### 1. Create a new CI/CD pipeline (e.g. for frontend)

```
create_pipeline(
  name="merge-dev-to-main-frontend",
  build_job_id="cfe868d3d60f4c0dbd960a471a58720b",
  target_branch="main",
  source_branch="dev",
  path_filter="anh-ingestion-zone/src/AnhIdp.Frontend/",
  job_name="build-frontend"
)
```

**Important:** After creation, the pipeline MUST be published (is_publish=true) and triggers re-saved in the CodeArts UI for webhooks to work. The API has a known limitation where `UpdatePipelineInfo` with complex `--definition` may fail with `PARSE_REQUEST_DATA_EXCEPTION`. If the tool reports a partial failure, guide the user to complete configuration in the UI.

### Trigger Configuration Pattern

Trigger sub-fields (merge, create, update, branches, paths) are NOT exposed as CLI flags. To configure them, use `--cli-jsonInput` with a JSON file:

```python
# Write JSON file for trigger update
cli_input = {
    "path": {
        "project_id": "<PROJECT_ID>",
        "pipeline_id": "<PIPELINE_ID>"
    },
    "body": {
        "name": "<PIPELINE_NAME>",
        "is_publish": False,
        "definition": "<DEFINITION_JSON_STRING>",
        "sources": [...],
        "triggers": [{
            "git_type": "codehub",
            "git_url": "<REPO_HTTPS_URL>",
            "repo_id": "<REPO_ID>",
            "pipeline_id": "<PIPELINE_ID>",
            "hook_id": "<WEBHOOK_ID>",
            "events": [
                {
                    "type": "merge_request",
                    "enable": True,
                    "create": False, "update": False, "code_update": False,
                    "merge": True,  # ONLY trigger on merge event
                    "reopen": False, "close": False,
                    "branches": ["main"],
                    "paths": ["<REPO_NAME>/src/<APP_PATH>/"]
                },
                {"type": "push", "enable": False},
                {"type": "tag_push", "enable": False}
            ]
        }]
    }
}
# Then: hcloud CodeArtsPipeline UpdatePipelineInfo --cli-region=<REGION> --cli-jsonInput=<FILE>
```

### Pipeline Creation Pattern (2-step)

Step 1: Create with minimal definition (avoids PARSE_REQUEST_DATA_EXCEPTION):
```
hcloud CodeArtsPipeline CreatePipelineNew --cli-region=<REGION> --project_id=<PROJECT_ID> --name=<NAME> --is_publish=false --definition='{"stages":[]}'
```

Step 2: Update with full definition + sources via `UpdatePipelineInfo` CLI flags.

Step 3: Configure trigger sub-fields via `--cli-jsonInput` (if needed).

### 2. Run a pipeline manually

```
run_pipeline(
  pipeline_id="79ec5b91e3a34507ae13aa7b77058c48",
  branch="main",
  event_type="MR"
)
```

Use `event_type="MR"` to simulate a merge request trigger. Use `event_type="push"` for direct push simulation.

After running, capture the `pipeline_run_id` from the response to check status.

### 3. Check pipeline run status

```
get_pipeline_status(
  pipeline_id="79ec5b91e3a34507ae13aa7b77058c48",
  pipeline_run_id="<from run_pipeline response>"
)
```

Poll this periodically for long-running pipelines. Status values: `RUNNING`, `COMPLETED`, `FAILED`, `CANCELED`, `PENDING`.

### 4. Update build tag to dynamic format

```
update_build_tag(
  job_id="38ad6ace750d42be8386a802ce43c8e7",
  tag_format="v1.3.0-${BUILDNUMBER}"
)
```

**Dynamic variables available:**
- `${BUILDNUMBER}` — auto-incremented build number (recommended)
- `${date}` — execution date
- `${commit_id}` — commit hash

### 5. Enable auto-build (requires Maintainer)

```
enable_auto_build(
  job_id="38ad6ace750d42be8386a802ce43c8e7",
  enable=true
)
```

**Role requirement:** Only Maintainer (40) can enable is_auto_build because it creates a webhook on the repo. Developer (20) will get error `CB.032038`. If it fails, tell the user to:
1. Elevate the user to Maintainer in Repo Members, OR
2. Enable the toggle manually: Build → [Job] → Schedule tab → "Run upon code commit"

### 6. Verify webhook / trigger setup

```
check_webhook(pipeline_id="79ec5b91e3a34507ae13aa7b77058c48")
```

**Known limitation:** `ListRepositoryWebhooks` API returns `[]` even when system webhooks exist. If no webhooks are found but the pipeline has triggers configured, advise the user to re-save trigger settings in the UI to recreate the webhook.

### 7. List available plugins for pipeline steps

```
list_pipeline_plugins()
```

Returns all available step plugins organized by category (Build, Gate, Deploy, Normal, Test).

## Pipeline Plugin Reference

| Plugin | Category | Use Case |
|---|---|---|
| `official_devcloud_cloudBuild` | Build | Run a Build job from pipeline |
| `official_devcloud_codeCheck` | Gate | Code quality check (free tier: no C#) |
| `official_shell_plugin` | Normal | Execute shell commands |
| `official_devcloud_checkpoint` | Normal | Human approval gate |
| `official_repo_merge` | Normal | Auto-merge branches |
| `official_git_clone` | Normal | Download repo |
| `official_devcloud_deploy` | Deploy | Deploy to CCE/ECS |
| `official_devcloud_apiTest` | Test | Run API tests |

## Known Issues & Solutions

| Issue | Solution |
|---|---|
| Pipeline never triggers on MR | Re-save trigger settings in UI to recreate webhook; ensure is_publish=true |
| `UpdatePipelineInfo` PARSE_REQUEST_DATA_EXCEPTION | Create with `{"stages":[]}`, then update; or use `--cli-jsonInput` |
| Trigger sub-fields (merge, paths, branches) not settable via CLI | Use `--cli-jsonInput` with full JSON body including path.pipeline_id |
| CodeCheck CC.10010270.400 | C# ruleset not in free tier — use `check-backend-others` (TS/JS/Python) |
| Build fails "wrong build job scm info" | Ensure pipeline source has git_url, codehub_id, target_branch configured |
| is_auto_build toggle not visible | Need Maintainer (40) role, not Developer (20) |
| `is_publish=false` after API create | Save/publish pipeline from UI — no reliable API method found |
| Pipeline concurrency exceeded | Wait for running pipeline to finish, then retry |

## Safety Rules

1. **Never run a pipeline without confirming with the user** — pipelines trigger builds that consume resources
2. **Never enable is_auto_build without warning about Maintainer requirement**
3. **Always check pipeline status after running** — report COMPLETED/FAILED result
4. **If create_pipeline partially fails**, provide the definition JSON so the user can complete setup in the UI
5. **For production pipelines**, always recommend testing with a manual run first before enabling auto-triggers
