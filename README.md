# Huawei Cloud Deploy MCP

Generate Huawei Cloud Terraform infrastructure using Huawei Cloud MaaS, OpenCode, and the Model Context Protocol.

## What is this?

`huaweicloud-deploy-mcp` is an MCP server that helps cloud engineers, architects, and developers generate Huawei Cloud infrastructure as Terraform code through an AI-assisted workflow.

The recommended workflow uses Huawei Cloud MaaS as the LLM backend and this MCP server as the infrastructure generation tool.

## Why use it?

Instead of manually writing Terraform from scratch, you describe the target architecture to an AI agent powered by Huawei Cloud MaaS. The MCP server generates local Terraform files that you can review, back up, validate, and execute manually.

## Core principles

- Huawei Cloud MaaS-first workflow.
- Terraform code is generated locally.
- The generated Terraform workspace path is always displayed.
- No credentials are stored in generated Terraform files.
- `terraform apply` and `terraform destroy` are intentionally blocked by the MCP server.
- Human review is required before applying infrastructure changes.
- Designed for labs, demos, PoCs, architecture acceleration, and controlled infrastructure generation.

## Supported resources

Current ready resources include:

- VPC
- Subnet
- Security Group
- ECS
- EVS
- EIP
- ELB v3
- RDS MySQL
- OBS bucket

## Safety model

This MCP server generates Terraform files and allows safe Terraform commands such as:

- `terraform init`
- `terraform validate`
- `terraform fmt`
- `terraform plan`
- `terraform show`

The MCP server blocks destructive or provisioning actions such as:

- `terraform apply`
- `terraform destroy`

Users must manually review and execute Terraform outside the MCP workflow if they decide to deploy the generated infrastructure.

## Terraform workspace visibility

Every generation response includes the path where the Terraform files were created.

Example response fields:

~~~json
{
  "terraform_workspace_path": "/absolute/path/to/workspaces/small-web-app",
  "terraform_files": {
    "versions_tf": "/absolute/path/to/workspaces/small-web-app/versions.tf",
    "providers_tf": "/absolute/path/to/workspaces/small-web-app/providers.tf",
    "variables_tf": "/absolute/path/to/workspaces/small-web-app/variables.tf",
    "main_tf": "/absolute/path/to/workspaces/small-web-app/main.tf",
    "outputs_tf": "/absolute/path/to/workspaces/small-web-app/outputs.tf",
    "tfvars_example": "/absolute/path/to/workspaces/small-web-app/terraform.tfvars.example"
  },
  "next_steps": [
    "cd /absolute/path/to/workspaces/small-web-app",
    "terraform init",
    "terraform plan"
  ]
}
~~~

This makes the generated infrastructure auditable, reviewable, and easy to back up.

## Requirements

- Node.js 20+
- Terraform
- Huawei Cloud account
- Huawei Cloud credentials configured for the Terraform provider
- Huawei Cloud MaaS API access
- MCP-compatible client such as OpenCode

## Install

~~~bash
git clone https://github.com/YOUR_USER/huaweicloud-deploy-mcp.git
cd huaweicloud-deploy-mcp
npm install
npm test
~~~

## Environment example

Create your local `.env` or export variables in your shell. Do not commit real credentials.

~~~bash
export HW_ACCESS_KEY="replace_me"
export HW_SECRET_KEY="replace_me"
export HW_REGION="la-north-2"

export MAAS_BASE_URL="https://replace-with-your-maas-endpoint"
export MAAS_API_KEY="replace_me"
export MAAS_MODEL="replace_with_enabled_model"
~~~

## MCP client example

Example MCP server configuration:

~~~json
{
  "mcpServers": {
    "huaweicloud-deploy": {
      "command": "node",
      "args": ["/absolute/path/to/huaweicloud-deploy-mcp/server.mjs"],
      "env": {
        "DEPLOY_WORKSPACE_BASE": "/absolute/path/to/huaweicloud-deploy-mcp/workspaces"
      }
    }
  }
}
~~~

## Example prompt

~~~text
Using Huawei Cloud MaaS and the Huawei Cloud Deploy MCP, generate Terraform for a small web application in la-north-2.

Architecture:
- 1 VPC
- 1 subnet
- 1 security group allowing HTTP
- 2 ECS instances
- 1 public ELB v3
- 1 EIP
- 1 RDS MySQL instance
- 1 OBS bucket

Show me the exact Terraform workspace path and the generated files.
Do not run terraform apply.
~~~

## Documentation

- [Huawei Cloud MaaS setup](docs/maas-setup.md)
- [OpenCode setup](docs/opencode-setup.md)
- [Playwright MCP companion setup](docs/playwright-mcp.md)
- [Terraform workspace behavior](docs/terraform-workspaces.md)
- [Supported services](docs/supported-services.md)
- [Examples](docs/examples.md)

## Repository separation

This public GitHub repository is intended to be a clean public release of the Deploy MCP only.

It should remain separate from any internal CodeArts repository, monorepo, lab workspace, Terraform state, customer PoC, or private credential material.

## License

MIT
# huaweicloud-deploy-mcp
