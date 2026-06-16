# Huawei Cloud Deploy MCP

Generate auditable Huawei Cloud Terraform infrastructure using Huawei Cloud MaaS, OpenCode, Docker, and MCP servers.

This guide shows how to:

1. Install OpenCode.
2. Configure OpenCode with Huawei Cloud MaaS as the LLM backend.
3. Add the `huaweicloud-deploy` MCP server from the public Docker image.
4. Add the Microsoft Playwright MCP server for browser automation.
5. Generate Terraform locally and review it before running any Terraform command manually.

---

## Architecture

```text
Huawei Cloud MaaS
       ↓
OpenCode
       ↓
MCP servers
 ├─ huaweicloud-deploy
 └─ playwright
       ↓
Generated Terraform files
```

The recommended workflow is:

```text
User prompt → OpenCode + MaaS → huaweicloud-deploy MCP → Terraform workspace on host
```

The MCP server generates Terraform files only. It does not run `terraform apply` or `terraform destroy`.

---

## 1. Install OpenCode

OpenCode requires Node.js 18 or later.

Check your Node.js version:

```bash
node -v
```

Install OpenCode globally:

```bash
npm install -g opencode-ai
```

Verify the installation:

```bash
opencode -v
```

---

## 2. Configure Huawei Cloud MaaS in OpenCode

Create the OpenCode configuration directory:

```bash
mkdir -p ~/.config/opencode
```

Create or edit the OpenCode configuration file:

```bash
nano ~/.config/opencode/opencode.json
```

Use this base configuration:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "huaweicloud-maas": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Huawei Cloud MaaS",
      "options": {
        "baseURL": "https://api-ap-southeast-1.modelarts-maas.com/openai/v1",
        "apiKey": "<MAAS_API_KEY>"
      },
      "models": {
        "glm-5.1": {
          "name": "glm-5.1"
        }
      }
    }
  }
}
```

Replace:

```text
<MAAS_API_KEY>
```

with your Huawei Cloud MaaS API key.

Do not commit your MaaS API key to Git.

Start OpenCode:

```bash
opencode
```

Inside OpenCode, run:

```text
/models
```

Select the configured Huawei Cloud MaaS model.

---

## 3. Create a local workspace directory

The deploy MCP writes Terraform files to a workspace directory.

Create a local host directory:

```bash
mkdir -p /mnt/d/huaweicloud-deploy-mcp-lab/workspaces
```

This host path will be mounted into the Docker container as:

```text
/app/workspaces
```

When Terraform is generated, the MCP response should include both paths:

```json
{
  "terraform_workspace_path": "/app/workspaces/rds-mysql-santiago",
  "terraform_workspace_host_path": "/mnt/d/huaweicloud-deploy-mcp-lab/workspaces/rds-mysql-santiago"
}
```

Where:

```text
terraform_workspace_path       = path inside the Docker container
terraform_workspace_host_path  = real path on the host machine
```

Use `terraform_workspace_host_path` to inspect, back up, validate, and plan the generated Terraform.

---

## 4. Add the huaweicloud-deploy MCP server to OpenCode

Edit the same OpenCode configuration file:

```bash
nano ~/.config/opencode/opencode.json
```

Add the `mcp` section.

Full example with Huawei Cloud MaaS and `huaweicloud-deploy` MCP:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "huaweicloud-maas": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Huawei Cloud MaaS",
      "options": {
        "baseURL": "https://api-ap-southeast-1.modelarts-maas.com/openai/v1",
        "apiKey": "<MAAS_API_KEY>"
      },
      "models": {
        "glm-5.1": {
          "name": "glm-5.1"
        }
      }
    }
  },
  "mcp": {
    "huaweicloud-deploy": {
      "type": "local",
      "enabled": true,
      "command": [
        "docker",
        "run",
        "-i",
        "--rm",
        "--init",
        "--pull=always",
        "-e",
        "DEPLOY_WORKSPACE_BASE=/app/workspaces",
        "-e",
        "DEPLOY_WORKSPACE_HOST_BASE=/mnt/d/huaweicloud-deploy-mcp-lab/workspaces",
        "-v",
        "/mnt/d/huaweicloud-deploy-mcp-lab/workspaces:/app/workspaces",
        "ghcr.io/magozcab/huaweicloud-deploy-mcp:latest"
      ],
      "timeout": 60000
    }
  }
}
```

Pull the public Docker image manually if desired:

```bash
docker pull ghcr.io/magozcab/huaweicloud-deploy-mcp:latest
```

Restart OpenCode:

```bash
opencode
```

---

## 5. Add Microsoft Playwright MCP to OpenCode

Playwright MCP allows OpenCode to control a browser through MCP tools.

You can run Playwright MCP with `npx`:

```json
{
  "mcp": {
    "playwright": {
      "type": "local",
      "enabled": true,
      "command": [
        "npx",
        "@playwright/mcp@latest"
      ]
    }
  }
}
```

Or you can run it with Docker:

```json
{
  "mcp": {
    "playwright": {
      "type": "local",
      "enabled": true,
      "command": [
        "docker",
        "run",
        "-i",
        "--rm",
        "--init",
        "--pull=always",
        "mcr.microsoft.com/playwright/mcp"
      ]
    }
  }
}
```

The Docker option currently runs Chromium in headless mode.

---

## 6. Full OpenCode configuration example

This example configures:

* Huawei Cloud MaaS as the LLM provider.
* `huaweicloud-deploy` MCP using the public GHCR Docker image.
* Playwright MCP using `npx`.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "huaweicloud-maas": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Huawei Cloud MaaS",
      "options": {
        "baseURL": "https://api-ap-southeast-1.modelarts-maas.com/openai/v1",
        "apiKey": "<MAAS_API_KEY>"
      },
      "models": {
        "glm-5.1": {
          "name": "glm-5.1"
        }
      }
    }
  },
  "mcp": {
    "huaweicloud-deploy": {
      "type": "local",
      "enabled": true,
      "command": [
        "docker",
        "run",
        "-i",
        "--rm",
        "--init",
        "--pull=always",
        "-e",
        "DEPLOY_WORKSPACE_BASE=/app/workspaces",
        "-e",
        "DEPLOY_WORKSPACE_HOST_BASE=/mnt/d/huaweicloud-deploy-mcp-lab/workspaces",
        "-v",
        "/mnt/d/huaweicloud-deploy-mcp-lab/workspaces:/app/workspaces",
        "ghcr.io/magozcab/huaweicloud-deploy-mcp:latest"
      ],
      "timeout": 60000
    },
    "playwright": {
      "type": "local",
      "enabled": true,
      "command": [
        "npx",
        "@playwright/mcp@latest"
      ]
    }
  }
}
```

---

## 7. Test the deploy MCP

Start OpenCode:

```bash
opencode
```

Use this prompt:

```text
Use the huaweicloud-deploy MCP to generate Terraform only.

Create an RDS MySQL pay-as-you-go architecture in Huawei Cloud Santiago.

Use:
- region: la-south-2
- availability_zone: la-south-2a
- architecture_id: rds-mysql-santiago
- deployment_mode: terraform

Create:
- one VPC
- one subnet
- one security group allowing MySQL 3306 only from the VPC CIDR
- one RDS MySQL instance with the smallest supported flavor and minimum supported storage

Do not run terraform apply.
Do not run terraform destroy.
Show terraform_workspace_path and terraform_workspace_host_path.
```

Expected result:

```json
{
  "terraform_workspace_path": "/app/workspaces/rds-mysql-santiago",
  "terraform_workspace_host_path": "/mnt/d/huaweicloud-deploy-mcp-lab/workspaces/rds-mysql-santiago"
}
```

---

## 8. Validate the generated Terraform manually

Use the host workspace path returned by the MCP:

```bash
export IMAGE="ghcr.io/magozcab/huaweicloud-deploy-mcp:latest"
export WORKSPACE_HOST="/mnt/d/huaweicloud-deploy-mcp-lab/workspaces/rds-mysql-santiago"
```

Check the generated files:

```bash
ls -lah "$WORKSPACE_HOST"
```

Run Terraform formatting check:

```bash
docker run --rm \
  -v "$WORKSPACE_HOST:/workspace" \
  -w /workspace \
  "$IMAGE" \
  terraform fmt -check -diff
```

Initialize Terraform without a remote backend:

```bash
docker run --rm \
  -v "$WORKSPACE_HOST:/workspace" \
  -w /workspace \
  "$IMAGE" \
  terraform init -backend=false
```

Validate Terraform:

```bash
docker run --rm \
  -v "$WORKSPACE_HOST:/workspace" \
  -w /workspace \
  "$IMAGE" \
  terraform validate
```

---

## 9. Run Terraform plan manually

Only run `terraform plan` after setting Huawei Cloud credentials in your shell.

Do not write credentials into Terraform files.

```bash
export HW_REGION_NAME="la-south-2"
export HW_ACCESS_KEY="replace_me"
export HW_SECRET_KEY="replace_me"
export TF_VAR_rds_password="replace_me"
```

Run plan:

```bash
docker run --rm \
  -e HW_REGION_NAME \
  -e HW_ACCESS_KEY \
  -e HW_SECRET_KEY \
  -e TF_VAR_rds_password \
  -v "$WORKSPACE_HOST:/workspace" \
  -w /workspace \
  "$IMAGE" \
  terraform plan -input=false
```

The plan command does not create infrastructure. It only shows what Terraform would do.

---

## 10. Safety rules

This MCP server is designed to generate Terraform files only.

It must not run:

```bash
terraform apply
terraform destroy
```

Do not commit:

```text
.env
*.tfvars
*.auto.tfvars
terraform.tfstate
terraform.tfstate.*
tfplan
*.pem
*.key
workspaces/
.terraform/
.terraform.lock.hcl
```

---

## 11. Notes about regional availability

Terraform validation checks syntax and provider schema, but it does not guarantee that every Huawei Cloud flavor exists in a selected region or availability zone.

For example, an RDS flavor such as:

```text
rds.mysql.s1.small
```

must still be validated for the selected region and availability zone during `terraform plan`.

Future versions of this project may integrate pricing or discovery data to avoid unavailable flavors.

