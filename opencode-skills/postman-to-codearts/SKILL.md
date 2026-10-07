---
name: postman-to-codearts
description: Use when the user wants to convert or migrate Postman collections (YAML or JSON) to Huawei Cloud CodeArts TestPlan native API test artifacts. Triggers on keywords like postman, testplan, api test, codearts testplan, migrar postman, transformar postman, postman to codearts, test plan, plan de pruebas, collection postman.
---

# Postman → CodeArts TestPlan Transformation Skill

Convert Postman collections (v11 YAML export or v2.1 JSON) into Huawei Cloud CodeArts TestPlan native API test case artifacts.

## Knowledge Base

The complete transformation reference is at:
```
/mnt/d/TAM/ANH TAM/testplan/codearts-transform-knowledge.md
```

This document contains 8 sections covering source format, target format, transformation rules, quality remediation, naming conventions, script conversion, checklist, and file organization.

## Example Output

A complete example of transformed artifacts (17 cases, 2 suites) is at:
```
/mnt/d/TAM/ANH TAM/testplan/codearts/
```

## Transformation Script

A Python script automates the conversion:
```
/root/.config/opencode/skills/postman-to-codearts/transform.py
```

### Usage

```bash
# Basic conversion (detect issues, generate artifacts)
python3 transform.py \
  --input /path/to/CARGUEPostman.zip \
  --env /path/to/QA_ANH.environment.yaml \
  --output /path/to/codearts-output/

# Multiple collections
python3 transform.py \
  --input /path/to/CARGUEPostman.zip /path/to/pruebasPostman.zip \
  --env /path/to/QA_ANH.environment.yaml \
  --output /path/to/codearts-output/

# Auto-fix quality issues during transformation
python3 transform.py \
  --input /path/to/CARGUEPostman.zip \
  --env /path/to/QA_ANH.environment.yaml \
  --output /path/to/codearts-output/ \
  --fix-quality

# Dry run (report only, no files written)
python3 transform.py \
  --input /path/to/CARGUEPostman.zip \
  --env /path/to/QA_ANH.environment.yaml \
  --output /path/to/codearts-output/ \
  --dry-run
```

## Workflow

### Step 1: Parse Input

1. Unzip each input file
2. Read `definition.yaml` for collection-level variables
3. Read each `*.request.yaml` for individual requests
4. Read environment YAML for variable definitions
5. Count total requests and identify duplicates

### Step 2: Detect Quality Issues

Scan each request for these patterns:

| Issue | Detection Pattern | Severity |
|-------|-------------------|----------|
| Hardcoded JWT | `auth.credentials.token` matches `eyJ[A-Za-z0-9-_]+\.` | HIGH |
| Empty request | `url: ""` and no body/tests | HIGH |
| Exposed credentials | Body or script contains literal passwords | HIGH |
| Misplaced success code | Test named "exitoso" accepts error codes (401, 500) | HIGH |
| Empty formdata body | `body.type: formdata` with `content: []` | MEDIUM |
| No post-response tests | Request has no `afterResponse` script | MEDIUM |
| Duplicate request | Same URL + method + body as another request | LOW |
| Local file paths | `src` contains `/C:/` or `/Users/` | LOW |
| Postman cloud URIs | `src` contains `postman-cloud://` | LOW |

### Step 3: Classify into Suites

Based on URL path:
- `/api/auth/login` or `/oauth2/token` → **SUITE-AUTH**
- `/api/reporte/upload` or `/api/Reporte/upload` → **SUITE-UPLOAD**
- Other paths → **SUITE-API** (generic)

### Step 4: Transform Each Request

Apply transformation rules (see knowledge base sections 3.1–3.8):

1. **URL**: Remove hardcoded domains → `{{base_url}}`, normalize path casing, trim spaces
2. **Headers**: Object/array → key-value array, skip `disabled: true`, inject Authorization from auth config
3. **Body**: Map type (`json`→`json`, `formdata`→`form-data`, `urlencoded`→`x-www-form-urlencoded`), convert file paths to `test-data/` relative
4. **Auth**: Bearer with `{{authToken}}` → Authorization header; flag hardcoded JWTs
5. **Pre-script**: Convert `pm.variables.set()` → `env.set()`, `pm.environment.get()` → `env.get()`, `{{$guid}}` → `utils.uuid()`
6. **Post-script**: Decompose `pm.test()` assertions into:
   - **CheckPoints** (STATUS_CODE, RESPONSE_TIME, JSON_PATH, BODY_CONTAINS, etc.)
   - **Extracts** (JSON_PATH for `pm.environment.set()` after response parsing)
   - **Residual post_script** (complex logic that can't be declarative)

### Step 5: Apply Quality Fixes (if --fix-quality)

| Fix | Action |
|-----|--------|
| Hardcoded JWT | Replace with `{{authToken}}`, add extract in login step |
| Empty request | Generate placeholder with correct endpoint based on name |
| Misplaced success code | Remove error codes from success `oneOf()` |
| Empty formdata | Add note in description, create boundary test case |
| No post-response tests | Generate basic checkpoints (status code, response time) |
| Duplicate request | Keep first, mark second with `duplicate_of` tag |
| Local/cloud paths | Convert to `test-data/<filename>` relative path |

### Step 6: Generate Artifacts

Output directory structure:
```
<output>/
├── project.json
├── environment.json
├── testplan.json
├── suites/
│   ├── suite-auth.json
│   └── suite-upload.json
├── cases/
│   ├── auth/
│   │   ├── TC-AUTH-001.json
│   │   └── ...
│   └── upload/
│       ├── TC-UPLOAD-001.json
│       └── ...
└── test-data/
    └── (placeholder fixture files)
```

### Step 7: Validate Consistency

- All case IDs are unique
- All variables referenced in cases exist in environment.json
- Suite case lists match actual files
- No hardcoded credentials or JWTs remain
- Total case count matches expected (source - duplicates)

## CodeArts TestPlan Upload

After generating artifacts, upload to CodeArts TestPlan via API or console:

### Via API (hcloud CLI)

```bash
# Create project
hcloud CloudTest CreateProject --cli-region=la-north-2 --project_name=QA_ANH_API

# Create test plan
hcloud CloudTest CreatePlan --cli-region=la-north-2 --project_id=<PROJECT_ID> --name="Plan-QA-ANH-API-v1"

# Create test case (repeat for each)
hcloud CloudTest CreateTestCase --cli-region=la-north-2 --project_id=<PROJECT_ID> --name="TC-AUTH-001" --type=API
```

### Via Console

1. Navigate to CodeArts > Testing > TestPlan
2. Create project "QA_ANH_API"
3. Create plan "Plan-QA-ANH-API-v1"
4. Create 2 modules: Auth, Upload
5. For each case JSON, create API test case and configure:
   - Request (URL, method, headers, body)
   - Pre-script and Post-script
   - CheckPoints (assertions)
   - Extracts (variable capture)
6. Configure environment variables
7. Execute Auth suite first, then Upload suite

## Pipeline Integration

Connect the test plan to a CodeArts CI/CD pipeline using the `official_devcloud_apiTest` plugin:

```
create_pipeline(
  name="api-test-merge-trigger",
  build_job_id="<api_test_job_id>",
  target_branch="main",
  source_branch="dev",
  path_filter="anh-ingestion-zone/src/",
  job_name="run-api-tests"
)
```

Or add an API Test step to an existing pipeline to run the test plan after build.

## Assertion → CheckPoint Quick Reference

| Postman Pattern | CodeArts CheckPoint |
|-----------------|---------------------|
| `pm.response.to.have.status(N)` | `{"type":"STATUS_CODE","operator":"EQUALS","value":"N"}` |
| `pm.expect(pm.response.code).to.be.oneOf([a,b])` | `{"type":"STATUS_CODE","operator":"IN","value":"a,b"}` |
| `pm.expect(pm.response.responseTime).to.be.below(N)` | `{"type":"RESPONSE_TIME","operator":"LESS_THAN","value":"N"}` |
| `pm.expect(json).to.have.property("x")` | `{"type":"JSON_PATH","operator":"EXISTS","value":"$.x"}` |
| `pm.expect(json.x).to.be.undefined` | `{"type":"JSON_PATH","operator":"NOT_EXISTS","value":"$.x"}` |
| `pm.expect(text).to.include("x")` | `{"type":"BODY_CONTAINS","operator":"CONTAINS","value":"x"}` |
| `pm.expect(text).to.not.include("x")` | `{"type":"BODY_CONTAINS","operator":"NOT_CONTAINS","value":"x"}` |

## Script API Conversion Quick Reference

| Postman | CodeArts |
|---------|----------|
| `pm.variables.set(k, v)` | `env.set(k, v)` |
| `pm.environment.set(k, v)` | `env.set(k, v)` |
| `pm.environment.get(k)` | `env.get(k)` |
| `pm.response.code` | `response.status` |
| `pm.response.responseTime` | `response.time` |
| `pm.response.json()` | `response.json()` |
| `pm.response.text()` | `response.text()` |
| `pm.response.headers.get("H")` | `response.headers["H"]` |
| `pm.response.to.have.status(N)` | `assert.equal(response.status, N)` |
| `pm.expect(x).to.be.oneOf([...])` | `assert.ok([...].includes(x))` |
| `pm.expect(x).to.be.below(N)` | `assert.ok(x < N)` |
| `pm.expect(x).to.include("s")` | `assert.ok(x.includes("s"))` |
| `pm.expect(x).to.not.include("s")` | `assert.ok(!x.includes("s"))` |
| `{{$guid}}` | `utils.uuid()` |
| `{{$timestamp}}` | `Math.floor(Date.now() / 1000)` |

## Safety Rules

1. **Never expose credentials** — Always replace hardcoded passwords/tokens with `{{variable}}` references
2. **Never accept error codes as success** — A test named "exitoso" must not include 4xx/5xx in expected status
3. **Always preserve source tracking** — Each generated case includes `source.postman_collection` and `source.postman_request`
4. **Always validate after generation** — Run consistency check before uploading to CodeArts
5. **Always run Auth suite first** — Upload cases depend on `{{authToken}}` from login
