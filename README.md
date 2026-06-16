# Huawei Cloud Deploy MCP

Guía paso a paso para usar Huawei Cloud MaaS, OpenCode y MCP servers para generar infraestructura Huawei Cloud con Terraform.

Esta guía está pensada para una persona que empieza desde cero.

Al finalizar, tendrás OpenCode funcionando con Huawei Cloud MaaS y podrás integrar el MCP `huaweicloud-deploy` de dos formas:

* Opción A: usando Node.js local.
* Opción B: usando Docker, recomendada para usuarios finales.

También se incluye la integración opcional con Microsoft Playwright MCP para automatización de navegador.

---

# 1. Qué estás instalando

Antes de ejecutar comandos, es importante entender qué hace cada componente.

## Huawei Cloud MaaS

Huawei Cloud MaaS es el servicio que provee el modelo de lenguaje. En este proyecto MaaS actúa como el backend LLM de OpenCode.

OpenCode enviará tus prompts a MaaS.

## OpenCode

OpenCode es el cliente de línea de comandos donde escribes los prompts.

Desde OpenCode podrás pedir cosas como:

```text
Generate Huawei Cloud Terraform for an RDS MySQL architecture.
```

## MCP

MCP significa Model Context Protocol.

Un MCP server es una herramienta externa que OpenCode puede usar.

En este proyecto usaremos:

```text
huaweicloud-deploy MCP
```

para generar Terraform.

Opcionalmente también usaremos:

```text
playwright MCP
```

para automatizar navegación web.

## Terraform

Terraform es la herramienta que describe infraestructura como código.

Este MCP genera archivos Terraform, por ejemplo:

```text
main.tf
variables.tf
outputs.tf
providers.tf
versions.tf
terraform.tfvars.example
```

## Workspace

El workspace es la carpeta donde quedan los archivos Terraform generados.

Ejemplo:

```text
/mnt/d/huaweicloud-deploy-mcp-lab/workspaces/rds-mysql-santiago
```

---

# 2. Reglas de seguridad

Este proyecto está diseñado para generar Terraform auditable.

El MCP puede generar archivos Terraform, pero no debe ejecutar:

```bash
terraform apply
terraform destroy
```

El usuario debe revisar el Terraform generado y ejecutar manualmente comandos seguros como:

```bash
terraform fmt
terraform init
terraform validate
terraform plan
terraform show
```

No guardes credenciales en el repositorio.

No subas a GitHub archivos como:

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

# 3. Requisitos previos

Esta guía asume Linux, Ubuntu o WSL.

Verifica que tienes terminal disponible.

## 3.1 Verificar Node.js

OpenCode requiere Node.js 18 o superior.

Ejecuta:

```bash
node -v
```

Ejemplo de resultado válido:

```text
v20.20.2
```

Si no tienes Node.js instalado, instala Node.js antes de continuar.

También verifica npm:

```bash
npm -v
```

## 3.2 Verificar Git

```bash
git --version
```

## 3.3 Verificar Docker

Docker es necesario para la opción recomendada.

```bash
docker version
```

Si Docker responde correctamente, puedes usar la opción Docker.

---

# 4. Instalar OpenCode

Instala OpenCode globalmente con npm:

```bash
npm install -g opencode-ai
```

Verifica la instalación:

```bash
opencode -v
```

Si ves una versión, OpenCode quedó instalado correctamente.

---

# 5. Configurar Huawei Cloud MaaS en OpenCode

OpenCode usa un archivo de configuración llamado:

```text
~/.config/opencode/opencode.json
```

Crea la carpeta de configuración:

```bash
mkdir -p ~/.config/opencode
```

Abre el archivo con vim:

```bash
vim ~/.config/opencode/opencode.json
```

Si el archivo está vacío, presiona:

```text
i
```

para entrar en modo edición.

Pega este contenido:

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

Reemplaza:

```text
<MAAS_API_KEY>
```

por tu API key real de Huawei Cloud MaaS.

Para guardar en vim:

```text
Esc
:wq
Enter
```

---

# 6. Probar OpenCode con MaaS

Ejecuta:

```bash
opencode
```

Dentro de OpenCode, escribe:

```text
/models
```

Selecciona el modelo de Huawei Cloud MaaS.

Ejemplo esperado:

```text
huaweicloud-maas/glm-5.1
```

Luego prueba un prompt simple:

```text
Say hello and confirm that you are using Huawei Cloud MaaS.
```

Si OpenCode responde, MaaS está funcionando.

---

# 7. Crear carpeta de workspaces

El MCP necesita una carpeta donde generar los archivos Terraform.

Crea una carpeta local:

```bash
mkdir -p /mnt/d/huaweicloud-deploy-mcp-lab/workspaces
```

Valida que existe:

```bash
ls -lah /mnt/d/huaweicloud-deploy-mcp-lab/workspaces
```

En esta guía usaremos este path:

```text
/mnt/d/huaweicloud-deploy-mcp-lab/workspaces
```

Si estás en otra máquina, puedes cambiarlo por otro path, por ejemplo:

```text
/home/ubuntu/huaweicloud-deploy-mcp-lab/workspaces
```

Lo importante es usar el mismo path en toda la configuración.

---

# 8. Opción A: levantar huaweicloud-deploy MCP usando Node.js local

Esta opción es útil para desarrollo o para modificar el código del MCP.

Usa esta opción si quieres:

* clonar el repositorio,
* instalar dependencias,
* correr tests,
* modificar el código,
* ejecutar `server.mjs` localmente.

## 8.1 Clonar el repositorio

```bash
mkdir -p ~/github-repos
cd ~/github-repos

git clone https://github.com/Magozcab/huaweicloud-deploy-mcp.git
cd huaweicloud-deploy-mcp
```

## 8.2 Instalar dependencias

# Install Node.js with nvm

This project uses Node.js for OpenCode and for the local development mode of `huaweicloud-deploy-mcp`.

The recommended way to install Node.js is using `nvm`.

Install `nvm`:

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

Load `nvm` in the current shell session:

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
```

Install Node.js 20.20.2:

```bash
nvm install 20.20.2
nvm use 20.20.2
nvm alias default 20.20.2
```

Validate the installation:

```bash
node -v
npm -v
which node
```

Expected Node.js version:

```text
v20.20.2
```

Why this matters:

OpenCode can run with Node.js 18 or later, but running `huaweicloud-deploy-mcp` directly with Node.js requires support for JSON import attributes.

If you use an older Node.js version, such as:

```text
v18.19.1
```

you may see this error:

```text
SyntaxError: Unexpected token 'with'
MCP error -32000: Connection closed
```

To avoid local Node.js compatibility issues, use Node.js 20.20.2 or use the Docker option.


```bash
npm install
```

## 8.3 Ejecutar tests

```bash
npm test
```

Si los tests pasan, el MCP está funcionando a nivel local.

## 8.4 Obtener el path absoluto del servidor

Ejecuta:

```bash
pwd
```

Ejemplo de resultado:

```text
/root/github-repos/huaweicloud-deploy-mcp
```

El archivo principal del MCP será:

```text
/root/github-repos/huaweicloud-deploy-mcp/server.mjs
```

Ajusta ese path según el resultado real de tu máquina.

## 8.5 Configurar OpenCode para usar el MCP con Node.js

Abre el archivo de configuración:

```bash
vim ~/.config/opencode/opencode.json
```

Presiona:

```text
i
```

Reemplaza el contenido por este ejemplo, ajustando el path de `server.mjs` si es necesario:

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
        "node",
        "/root/github-repos/huaweicloud-deploy-mcp/server.mjs"
      ],
      "env": {
        "DEPLOY_WORKSPACE_BASE": "/mnt/d/huaweicloud-deploy-mcp-lab/workspaces",
        "DEPLOY_WORKSPACE_HOST_BASE": "/mnt/d/huaweicloud-deploy-mcp-lab/workspaces"
      },
      "timeout": 60000
    }
  }
}
```

Reemplaza:

```text
<MAAS_API_KEY>
```

por tu API key real.

Guarda en vim:

```text
Esc
:wq
Enter
```

## 8.6 Probar OpenCode con MCP Node.js

Ejecuta:

```bash
opencode
```

Usa este prompt:

```text
Use the huaweicloud-deploy MCP to generate Terraform only.

Create an RDS MySQL pay-as-you-go architecture in Huawei Cloud Santiago.

Use:
- region: la-south-2
- availability_zone: la-south-2a
- architecture_id: rds-mysql-santiago-node
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

Resultado esperado:

```json
{
  "terraform_workspace_path": "/mnt/d/huaweicloud-deploy-mcp-lab/workspaces/rds-mysql-santiago-node",
  "terraform_workspace_host_path": "/mnt/d/huaweicloud-deploy-mcp-lab/workspaces/rds-mysql-santiago-node"
}
```

Valida que los archivos se generaron:

```bash
ls -lah /mnt/d/huaweicloud-deploy-mcp-lab/workspaces/rds-mysql-santiago-node
```

---

# 9. Opción B: levantar huaweicloud-deploy MCP usando Docker

Esta es la opción recomendada para usuarios finales.

Usa esta opción si quieres:

* no clonar el repositorio,
* no instalar dependencias del proyecto,
* usar la imagen pública de GHCR,
* tener una experiencia más limpia y reproducible.

La imagen pública es:

```text
ghcr.io/magozcab/huaweicloud-deploy-mcp:latest
```

## 9.1 Descargar la imagen Docker

```bash
docker pull ghcr.io/magozcab/huaweicloud-deploy-mcp:latest
```

## 9.2 Verificar que la imagen funciona

```bash
docker run --rm ghcr.io/magozcab/huaweicloud-deploy-mcp:latest node -v
```

También verifica Terraform:

```bash
docker run --rm ghcr.io/magozcab/huaweicloud-deploy-mcp:latest terraform version
```

## 9.3 Configurar OpenCode para usar el MCP con Docker

Abre la configuración:

```bash
vim ~/.config/opencode/opencode.json
```

Presiona:

```text
i
```

Pega este contenido:

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

Reemplaza:

```text
<MAAS_API_KEY>
```

por tu API key real.

Guarda con vim:

```text
Esc
:wq
Enter
```

## 9.4 Explicación del bloque Docker

Esta parte le dice al contenedor dónde guardar los archivos internamente:

```text
DEPLOY_WORKSPACE_BASE=/app/workspaces
```

Esta parte le dice al MCP cuál es la ruta real en el host:

```text
DEPLOY_WORKSPACE_HOST_BASE=/mnt/d/huaweicloud-deploy-mcp-lab/workspaces
```

Esta parte monta la carpeta del host dentro del contenedor:

```text
/mnt/d/huaweicloud-deploy-mcp-lab/workspaces:/app/workspaces
```

Por eso, cuando el MCP genere Terraform, debe mostrar dos rutas:

```json
{
  "terraform_workspace_path": "/app/workspaces/rds-mysql-santiago",
  "terraform_workspace_host_path": "/mnt/d/huaweicloud-deploy-mcp-lab/workspaces/rds-mysql-santiago"
}
```

La primera ruta existe dentro del contenedor.

La segunda ruta existe en tu máquina.

Debes usar la segunda ruta para revisar los archivos.

## 9.5 Probar OpenCode con MCP Docker

Ejecuta:

```bash
opencode
```

Usa este prompt:

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

Resultado esperado:

```json
{
  "terraform_workspace_path": "/app/workspaces/rds-mysql-santiago",
  "terraform_workspace_host_path": "/mnt/d/huaweicloud-deploy-mcp-lab/workspaces/rds-mysql-santiago"
}
```

Valida archivos en el host:

```bash
ls -lah /mnt/d/huaweicloud-deploy-mcp-lab/workspaces/rds-mysql-santiago
```

Deberías ver archivos similares a:

```text
main.tf
outputs.tf
providers.tf
terraform.tfvars.example
variables.tf
versions.tf
```

---

# 10. Validar Terraform generado

Esta sección aplica tanto para la opción Node.js como para la opción Docker.

Define la ruta del workspace.

Si usaste Docker:

```bash
export WORKSPACE_HOST="/mnt/d/huaweicloud-deploy-mcp-lab/workspaces/rds-mysql-santiago"
```

Si usaste Node.js:

```bash
export WORKSPACE_HOST="/mnt/d/huaweicloud-deploy-mcp-lab/workspaces/rds-mysql-santiago-node"
```

Define la imagen:

```bash
export IMAGE="ghcr.io/magozcab/huaweicloud-deploy-mcp:latest"
```

## 10.1 Revisar archivos

```bash
ls -lah "$WORKSPACE_HOST"
```

## 10.2 Buscar errores comunes

```bash
grep -RIn 'la-north-2a' "$WORKSPACE_HOST" || echo "OK: no hardcoded la-north-2a"
```

```bash
grep -RIn 'protocol *= *"all"' "$WORKSPACE_HOST" || echo "OK: no invalid protocol all"
```

```bash
grep -RIn 'availability_zone\|rds.mysql\|3306' "$WORKSPACE_HOST"
```

## 10.3 Ejecutar terraform fmt

```bash
docker run --rm \
  -v "$WORKSPACE_HOST:/workspace" \
  -w /workspace \
  "$IMAGE" \
  terraform fmt -check -diff
```

Si hay errores solo de formato, corrige con:

```bash
docker run --rm \
  -v "$WORKSPACE_HOST:/workspace" \
  -w /workspace \
  "$IMAGE" \
  terraform fmt -recursive
```

## 10.4 Ejecutar terraform init

```bash
docker run --rm \
  -v "$WORKSPACE_HOST:/workspace" \
  -w /workspace \
  "$IMAGE" \
  terraform init -backend=false
```

## 10.5 Ejecutar terraform validate

```bash
docker run --rm \
  -v "$WORKSPACE_HOST:/workspace" \
  -w /workspace \
  "$IMAGE" \
  terraform validate
```

Resultado esperado:

```text
Success! The configuration is valid.
```

---

# 11. Ejecutar terraform plan manualmente

No ejecutes `terraform plan` hasta tener credenciales Huawei Cloud disponibles.

Las credenciales no deben quedar guardadas en archivos.

Configura variables de entorno:

```bash
export HW_REGION_NAME="la-south-2"
export HW_ACCESS_KEY="replace_me"
export HW_SECRET_KEY="replace_me"
export TF_VAR_rds_password="replace_me"
```

Luego ejecuta:

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

Este comando no crea infraestructura.

Solo muestra lo que Terraform intentaría crear.

---

# 12. Integrar Microsoft Playwright MCP

Playwright MCP es opcional.

Sirve para que OpenCode pueda usar un navegador mediante MCP.

Puedes usarlo para inspeccionar páginas web, documentación o consolas web.

Hay dos formas:

```text
Opción A: Playwright MCP con npx
Opción B: Playwright MCP con Docker
```

## 12.1 Opción A: Playwright MCP con npx

Verifica Node.js:

```bash
node -v
npm -v
```

Prueba Playwright MCP:

```bash
npx -y @playwright/mcp@latest --help
```

Si muestra ayuda, puedes configurarlo en OpenCode.

Abre configuración:

```bash
vim ~/.config/opencode/opencode.json
```

Agrega `playwright` dentro del bloque `mcp`.

Ejemplo completo usando `huaweicloud-deploy` con Docker y `playwright` con npx:

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
        "-y",
        "@playwright/mcp@latest"
      ],
      "timeout": 60000
    }
  }
}
```

Guarda con vim:

```text
Esc
:wq
Enter
```

Reinicia OpenCode:

```bash
opencode
```

Prueba Playwright MCP con este prompt:

```text
Use the playwright MCP to open https://www.example.com and tell me the page title.
```

## 12.2 Opción B: Playwright MCP con Docker

Verifica Docker:

```bash
docker version
```

Descarga la imagen:

```bash
docker pull mcr.microsoft.com/playwright/mcp
```

Prueba la imagen:

```bash
docker run --rm \
  --init \
  --pull=always \
  mcr.microsoft.com/playwright/mcp \
  --help
```

Abre la configuración:

```bash
vim ~/.config/opencode/opencode.json
```

Usa este bloque para Playwright:

```json
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
  ],
  "timeout": 60000
}
```

La opción Docker de Playwright usa Chromium en modo headless.

---

# 13. Configuración completa recomendada

Esta configuración usa:

```text
Huawei Cloud MaaS
huaweicloud-deploy MCP con Docker
Playwright MCP con npx
```

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
        "-y",
        "@playwright/mcp@latest"
      ],
      "timeout": 60000
    }
  }
}
```

---

# 14. Comandos útiles de diagnóstico

Ver configuración de OpenCode:

```bash
cat ~/.config/opencode/opencode.json
```

Validar que Docker funciona:

```bash
docker ps
```

Validar imagen del deploy MCP:

```bash
docker pull ghcr.io/magozcab/huaweicloud-deploy-mcp:latest
```

Validar imagen de Playwright MCP:

```bash
docker pull mcr.microsoft.com/playwright/mcp
```

Ver carpetas generadas:

```bash
find /mnt/d/huaweicloud-deploy-mcp-lab/workspaces -maxdepth 2 -type f
```

Buscar archivos sensibles antes de subir cambios:

```bash
find . \
  -name ".env" \
  -o -name "*.tfstate" \
  -o -name "*.tfstate.*" \
  -o -name "*.tfvars" \
  -o -name "*.auto.tfvars" \
  -o -name "tfplan" \
  -o -name "*.pem" \
  -o -name "*.key"
```

---

# 15. Problemas frecuentes

## OpenCode no encuentra el modelo

Ejecuta:

```bash
opencode
```

Luego dentro de OpenCode:

```text
/models
```

Si el modelo no aparece, revisa:

```bash
cat ~/.config/opencode/opencode.json
```

Verifica:

```text
apiKey
baseURL
models
```

## Docker no puede montar el workspace

Verifica que la carpeta exista:

```bash
ls -lah /mnt/d/huaweicloud-deploy-mcp-lab/workspaces
```

Si no existe:

```bash
mkdir -p /mnt/d/huaweicloud-deploy-mcp-lab/workspaces
```

## El MCP devuelve /app/workspaces pero no veo archivos en mi máquina

Eso significa que debes revisar el volumen Docker.

La ruta host:

```text
/mnt/d/huaweicloud-deploy-mcp-lab/workspaces
```

debe coincidir con:

```text
DEPLOY_WORKSPACE_HOST_BASE
```

y con la parte izquierda del volumen:

```text
/mnt/d/huaweicloud-deploy-mcp-lab/workspaces:/app/workspaces
```

## terraform validate funciona pero terraform plan falla

`terraform validate` revisa sintaxis y estructura del provider.

No garantiza que un flavor exista en una región específica.

Por ejemplo:

```text
rds.mysql.s1.small
```

puede no estar disponible en:

```text
la-south-2
la-south-2a
```

En ese caso debes usar un flavor válido o mejorar el flujo con discovery/pricing.

---

# 16. Resumen del flujo recomendado

Para usuarios finales:

```text
1. Instalar Node.js
2. Instalar OpenCode
3. Configurar Huawei Cloud MaaS
4. Crear carpeta workspaces
5. Configurar huaweicloud-deploy MCP con Docker
6. Ejecutar OpenCode
7. Pedir generación de Terraform
8. Revisar terraform_workspace_host_path
9. Ejecutar terraform fmt/init/validate
10. Ejecutar terraform plan manualmente si tienes credenciales
```

Para desarrolladores:

```text
1. Clonar el repo
2. npm install
3. npm test
4. Configurar OpenCode apuntando a server.mjs
5. Modificar código
6. Probar MCP localmente
```

---

# 17. Licencia

MIT

