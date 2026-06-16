# Huawei Cloud Deploy MCP

Generate auditable Huawei Cloud Terraform infrastructure with Huawei Cloud MaaS, OpenCode, Docker, and the Model Context Protocol.

`huaweicloud-deploy-mcp` is a public MCP server that helps cloud engineers, architects, and developers generate Huawei Cloud infrastructure as Terraform code through an AI-assisted workflow.

The recommended experience is:

1. Use Huawei Cloud MaaS as the LLM backend in OpenCode.
2. Register this MCP server as a local tool.
3. Run the MCP server with Docker from the public GHCR image.
4. Generate Terraform files into a local host-mounted workspace.
5. Review, validate, and plan the Terraform manually.

The MCP server generates Terraform files only. It does not deploy or destroy infrastructure.

---

## Repository

```text
https://github.com/Magozcab/huaweicloud-deploy-mcp
```

## Public Docker image

```text
ghcr.io/magozcab/huaweicloud-deploy-mcp:latest
```

Pull the image:

```bash
docker pull ghcr.io/magozcab/huaweicloud-deploy-mcp:latest
```

---

## What this project does

This MCP server receives architecture requests from an MCP-compatible client such as OpenCode and generates Terraform files for Huawei Cloud.

The generated Terraform is written to a workspace directory so the user can inspect, back up, validate, and plan it manually.

The MCP response always includes the Terraform workspace path.

When Docker mode is used with a host-mounted workspace, the response includes both:

```json
{
  "terraform_workspace_path": "/app/workspaces/rds-mysql-santiago",
  "terraform_workspace_host_path": "/mnt/d/huaweicloud-deploy-mcp-lab/workspaces/rds-mysql-santiago"
}
```

Where:

* `terraform_workspace_path` is the path inside the container.
* `terraform_workspace_host_path` is the real path on the host machine.

Use `terraform_workspace_host_path` to review and run Terraform commands manually.

---

## Safety model

This MCP server is designed for Terraform generation and review workflows.

It can generate Terraform and support safe manual commands such as:

```bash
terraform fmt
terraform init
terraform validate
terraform plan
terraform show
```

The MCP server must not run:

```bash
terraform apply
terraform destroy
```

Users must review the generated Terraform before manually applying any infrastructure changes.

Do not store credentials in generated Terraform files.

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

## Supported resources

Current ready resources include:

* VPC
* Subnet
* Security Group
* ECS
* EVS
* EIP
* ELB v3
* RDS MySQL
* OBS bucket

---

# Recommended usage: Docker + OpenCode + Huawei Cloud MaaS

This is the recommended workflow for end users.

Users do not need to clone the repository. The MCP server can run directly from the public Docker image.

---

## 1. Create a local workspace directory

Example for WSL or Linux:

```bash
mkdir -p /mnt/d/huaweicloud-deploy-mcp-lab/workspaces
```

This directory will be mounted into the MCP container as:

```text
/app/workspaces
```

Terraform files generated inside the container will remain visible on the host through the mounted volume.

---

## 2. Configure OpenCode with Huawei Cloud MaaS

Use Huawei Cloud MaaS as an OpenAI-compatible provider in OpenCode.

Example values:

```text
Model: huaweicloud-maas/glm-5.1
Base URL: https://api-ap-southeast-1.modelarts-maas.com/openai/v1
API key: configure locally only
```

Do not commit MaaS API keys to this repository.

This MCP server does not call Huawei Cloud MaaS directly. OpenCode is responsible for connecting to the selected LLM provider.

---

## 3. Register the MCP server in OpenCode using Docker

Example `opencode.json` configuration:

```json
{
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

Change this host path according to your environment:

```text
/mnt/d/huaweicloud-deploy-mcp-lab/workspaces
```

Both values must point to the same host directory:

```json
"DEPLOY_WORKSPACE_HOST_BASE=/mnt/d/huaweicloud-deploy-mcp-lab/workspaces"
```

```json
"-v",
"/mnt/d/huaweicloud-deploy-mcp-lab/workspaces:/app/workspaces"
```

---

## 4. Example prompt

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

Expected response fields:

```json
{
  "terraform_workspace_path": "/app/workspaces/rds-mysql-santiago",
  "terraform_workspace_host_path": "/mnt/d/huaweicloud-deploy-mcp-lab/workspaces/rds-mysql-santiago"
}
```

---

## 5. Review the generated Terraform

Use the host path returned by the MCP:

```bash
export WORKSPACE_HOST="/mnt/d/huaweicloud-deploy-mcp-lab/workspaces/rds-mysql-santiago"

ls -lah "$WORKSPACE_HOST"
```

Expected files:

```text
versions.tf
providers.tf
variables.tf
main.tf
outputs.tf
terraform.tfvars.example
```

Check for common issues:

```bash
grep -RIn 'protocol *= *"all"' "$WORKSPACE_HOST" || echo "OK: no invalid protocol all"
grep -RIn 'la-north-2a' "$WORKSPACE_HOST" || echo "OK: no hardcoded la-north-2a"
grep -RIn 'availability_zone\|rds.mysql\|3306' "$WORKSPACE_HOST"
```

---

## 6. Validate Terraform manually using Docker

Use the same public image to run Terraform commands:

```bash
export IMAGE="ghcr.io/magozcab/huaweicloud-deploy-mcp:latest"
export WORKSPACE_HOST="/mnt/d/huaweicloud-deploy-mcp-lab/workspaces/rds-mysql-santiago"
```

Check Terraform version:

```bash
docker run --rm \
  -v "$WORKSPACE_HOST:/workspace" \
  -w /workspace \
  "$IMAGE" \
  terraform version
```

Check formatting:

```bash
docker run --rm \
  -v "$WORKSPACE_HOST:/workspace" \
  -w /workspace \
  "$IMAGE" \
  terraform fmt -check -diff
```

Initialize without remote backend:

```bash
docker run --rm \
  -v "$WORKSPACE_HOST:/workspace" \
  -w /workspace \
  "$IMAGE" \
  terraform init -backend=false
```

Validate:

```bash
docker run --rm \
  -v "$WORKSPACE_HOST:/workspace" \
  -w /workspace \
  "$IMAGE" \
  terraform validate
```

Expected result:

```text
Success! The configuration is valid.
```

---

## 7. Run Terraform plan manually

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

The plan command does not create infrastructure. It checks what Terraform would create, update, or delete.

---

## Important limitation: regional availability

Terraform syntax validation does not guarantee that every Huawei Cloud resource flavor exists in the selected region and availability zone.

For example, an RDS flavor such as:

```text
rds.mysql.s1.small
```

may need to be validated against the selected region and AZ, such as:

```text
la-south-2
la-south-2a
```

Future versions of this project may integrate discovery or pricing data so the MCP can avoid generating unavailable flavors.

Until then, users should verify regional availability during `terraform plan` or provide a known valid flavor explicitly.

---

# Alternative usage: local Node.js development mode

This mode is intended for development and contributors.

## Requirements

* Node.js 20+
* Terraform
* Docker, optional but recommended
* Huawei Cloud account
* Huawei Cloud MaaS API access
* MCP-compatible client such as OpenCode

## Clone and install

```bash
git clone https://github.com/Magozcab/huaweicloud-deploy-mcp.git
cd huaweicloud-deploy-mcp
npm install
npm test
```

## Run locally

```bash
node server.mjs
```

## Example OpenCode MCP configuration for local development

```json
{
  "mcp": {
    "huaweicloud-deploy": {
      "type": "local",
      "enabled": true,
      "command": [
        "node",
        "/absolute/path/to/huaweicloud-deploy-mcp/server.mjs"
      ],
      "env": {
        "DEPLOY_WORKSPACE_BASE": "/absolute/path/to/huaweicloud-deploy-mcp/workspaces"
      },
      "timeout": 60000
    }
  }
}
```

Use local mode when you want to modify the MCP source code or run tests directly.

Use Docker mode when you want the simplest public user experience.

---

# Docker development mode

Build locally:

```bash
docker build -t huaweicloud-deploy-mcp:local .
```

Run with a mounted workspace:

```bash
mkdir -p "$PWD/workspaces"

docker run -i --rm --init \
  -e DEPLOY_WORKSPACE_BASE=/app/workspaces \
  -e DEPLOY_WORKSPACE_HOST_BASE="$PWD/workspaces" \
  -v "$PWD/workspaces:/app/workspaces" \
  huaweicloud-deploy-mcp:local
```

---

# Test suite

Run all tests:

```bash
npm test
```

Current test coverage includes:

* Terraform generation
* Validation behavior
* No secret leakage
* Unsupported action handling
* Blocking `terraform apply`
* Phase 2 resources
* ELB v3 generation
* NAT gateway generation
* Workspace path output
* Availability zone parameter handling
* Security group rule validation

---

# Clean repository expectations

This public repository is intended to remain separate from:

* internal CodeArts repositories
* monorepos
* lab workspaces
* Terraform state
* customer PoC material
* real credentials
* private keys
* generated infrastructure workspaces

Before pushing changes, check:

```bash
find . -name ".env" \
  -o -name "*.tfstate" \
  -o -name "*.tfstate.*" \
  -o -name "*.tfvars" \
  -o -name "*.auto.tfvars" \
  -o -name "tfplan" \
  -o -name "*.pem" \
  -o -name "*.key"
```

The command should not return real credential or state files.

---

# Documentation

Additional documentation can be added under `docs/`, for example:

```text
docs/maas-setup.md
docs/opencode-setup.md
docs/terraform-workspaces.md
docs/supported-services.md
docs/examples.md
```

---

# License

MIT

