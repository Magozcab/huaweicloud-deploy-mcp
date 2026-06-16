# Huawei Cloud Deploy MCP

Guía completa para usar Huawei Cloud MaaS, OpenCode y MCP servers para generar infraestructura Huawei Cloud con Terraform.

Esta documentación está pensada para una persona que empieza desde cero.

---

# 1. Qué es este proyecto

`huaweicloud-deploy-mcp` es un MCP server público que permite generar infraestructura Huawei Cloud como código Terraform.

El objetivo es que un usuario pueda escribir una solicitud en OpenCode, usando Huawei Cloud MaaS como modelo de lenguaje, y que el MCP genere archivos Terraform revisables y auditables.

Repositorio público:

```text
https://github.com/Magozcab/huaweicloud-deploy-mcp
```

Imagen Docker pública:

```text
ghcr.io/magozcab/huaweicloud-deploy-mcp:latest
```

Este proyecto no está diseñado para ejecutar despliegues automáticamente. Está diseñado para generar Terraform y permitir que el usuario revise, valide y planifique manualmente.

Ejemplo de resultado esperado:

```text
main.tf
variables.tf
outputs.tf
providers.tf
versions.tf
terraform.tfvars.example
```

---

# 2. Arquitectura general

La arquitectura de uso es:

```text
Usuario
  |
  v
OpenCode
  |
  v
Huawei Cloud MaaS
  |
  v
MCP servers
  |
  +--> huaweicloud-deploy MCP
  |       |
  |       v
  |   Terraform files
  |
  +--> Playwright MCP
          |
          v
      Browser automation
```

El flujo principal es:

```text
Prompt del usuario
  |
  v
OpenCode usando Huawei Cloud MaaS
  |
  v
huaweicloud-deploy MCP
  |
  v
Generación de Terraform en un workspace local
```

El MCP genera archivos Terraform en una carpeta llamada workspace.

Ejemplo de workspace:

```text
/mnt/d/huaweicloud-deploy-mcp-lab/workspaces/rds-mysql-santiago
```

Cuando se usa Docker, el MCP debe mostrar dos rutas:

```json
{
  "terraform_workspace_path": "/app/workspaces/rds-mysql-santiago",
  "terraform_workspace_host_path": "/mnt/d/huaweicloud-deploy-mcp-lab/workspaces/rds-mysql-santiago"
}
```

Significado:

```text
terraform_workspace_path       = ruta dentro del contenedor Docker
terraform_workspace_host_path  = ruta real en la máquina del usuario
```

El usuario debe revisar los archivos usando `terraform_workspace_host_path`.

---

# 3. Reglas de seguridad

Este MCP server genera Terraform, pero no debe ejecutar comandos destructivos o de aprovisionamiento real.

El MCP no debe ejecutar:

```bash
terraform apply
terraform destroy
```

El usuario puede ejecutar manualmente comandos seguros como:

```bash
terraform fmt
terraform init
terraform validate
terraform plan
terraform show
```

Las credenciales no deben ir en el repositorio, ni en prompts, ni en archivos generados.

No subir a GitHub:

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

Antes de hacer commit, puedes revisar archivos sensibles con:

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

Si aparece algún archivo real con credenciales, estado Terraform o claves privadas, no lo subas.

---

# 4. Instalar Node.js con nvm

OpenCode necesita Node.js.

Además, si quieres usar el MCP en modo local con Node.js, este proyecto requiere una versión compatible con `import ... with { type: "json" }`.

Se recomienda usar Node.js `20.20.2`.

## 4.1 Instalar nvm

Ejecuta:

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

Carga `nvm` en la sesión actual:

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
```

## 4.2 Instalar Node.js recomendado

```bash
nvm install 20.20.2
nvm use 20.20.2
nvm alias default 20.20.2
```

## 4.3 Validar instalación

```bash
node -v
npm -v
which node
```

Resultado esperado:

```text
v20.20.2
```

## 4.4 Problema común con Node.js viejo

Si usas Node.js `v18.19.1`, puedes obtener este error:

```text
SyntaxError: Unexpected token 'with'
MCP error -32000: Connection closed
```

Esto pasa porque el código usa import attributes para cargar JSON:

```js
import supportedServicesConfig from "./config/supported-services.json" with { type: "json" };
```

Solución:

```bash
nvm install 20.20.2
nvm use 20.20.2
```

O usa la opción Docker, que no depende del Node.js local para ejecutar el MCP.

---

# 5. Instalar OpenCode

Instala OpenCode globalmente con npm:

```bash
npm install -g opencode-ai
```

Valida la instalación:

```bash
opencode -v
```

Si muestra una versión, OpenCode quedó instalado correctamente.

---

# 6. Configurar Huawei Cloud MaaS

OpenCode se configura mediante el archivo:

```text
~/.config/opencode/opencode.json
```

## 6.1 Crear carpeta de configuración

```bash
mkdir -p ~/.config/opencode
```

## 6.2 Editar configuración con vim

```bash
vim ~/.config/opencode/opencode.json
```

Dentro de `vim`, presiona:

```text
i
```

para entrar en modo edición.

Pega esta configuración base:

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

Para guardar en `vim`:

```text
Esc
:wq
Enter
```

## 6.3 Probar OpenCode con MaaS

Ejecuta:

```bash
opencode
```

Dentro de OpenCode, escribe:

```text
/models
```

Selecciona el modelo MaaS configurado.

Luego prueba:

```text
Say hello and confirm that you are using Huawei Cloud MaaS.
```

Si OpenCode responde, MaaS está funcionando.

---

# 7. Crear carpeta de workspaces

El workspace es donde el MCP guardará los archivos Terraform generados.

Crea una carpeta local:

```bash
mkdir -p /mnt/d/huaweicloud-deploy-mcp-lab/workspaces
```

Valida:

```bash
ls -lah /mnt/d/huaweicloud-deploy-mcp-lab/workspaces
```

En esta guía se usará este path:

```text
/mnt/d/huaweicloud-deploy-mcp-lab/workspaces
```

Si estás en Linux puro, también podrías usar algo como:

```text
/home/ubuntu/huaweicloud-deploy-mcp-lab/workspaces
```

Lo importante es usar el mismo path en toda la configuración.

---

# 8. Opción 1: usar MCP Deploy con Docker

Esta es la opción recomendada para usuarios finales.

Usa esta opción si quieres:

```text
No clonar el repositorio
No instalar dependencias del proyecto
No depender del Node.js local para ejecutar el MCP
Usar la imagen pública desde GHCR
Generar Terraform en una carpeta visible del host
```

## 8.1 Descargar la imagen pública

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
docker pull ghcr.io/magozcab/huaweicloud-deploy-mcp:latest
```

## 8.2 Validar Node.js dentro de la imagen

```bash
docker run --rm ghcr.io/magozcab/huaweicloud-deploy-mcp:latest node -v
```

## 8.3 Validar Terraform dentro de la imagen

```bash
docker run --rm ghcr.io/magozcab/huaweicloud-deploy-mcp:latest terraform version
```

## 8.4 Configurar OpenCode para usar el MCP con Docker

Edita la configuración:

```bash
vim ~/.config/opencode/opencode.json
```

Presiona:

```text
i
```

Reemplaza el contenido por esta configuración:

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

Guarda:

```text
Esc
:wq
Enter
```

## 8.5 Entender el volumen Docker

Esta variable define el workspace dentro del contenedor:

```text
DEPLOY_WORKSPACE_BASE=/app/workspaces
```

Esta variable define la ruta del workspace en el host:

```text
DEPLOY_WORKSPACE_HOST_BASE=/mnt/d/huaweicloud-deploy-mcp-lab/workspaces
```

Este volumen conecta host y contenedor:

```text
/mnt/d/huaweicloud-deploy-mcp-lab/workspaces:/app/workspaces
```

Por eso el MCP debe responder con dos rutas:

```json
{
  "terraform_workspace_path": "/app/workspaces/rds-mysql-santiago",
  "terraform_workspace_host_path": "/mnt/d/huaweicloud-deploy-mcp-lab/workspaces/rds-mysql-santiago"
}
```

Usa siempre `terraform_workspace_host_path` para revisar los archivos desde tu máquina.

---

# 9. Opción 2: usar MCP Deploy con Node.js local

Esta opción es para desarrollo o contribución al proyecto.

Usa esta opción si quieres:

```text
Clonar el repositorio
Modificar el código
Ejecutar npm test
Probar cambios locales
Depurar server.mjs o terraform-generator.mjs
```

## 9.1 Clonar el repositorio

```bash
mkdir -p ~/github-repos
cd ~/github-repos

git clone https://github.com/Magozcab/huaweicloud-deploy-mcp.git
cd huaweicloud-deploy-mcp
```

## 9.2 Verificar Node.js

```bash
node -v
```

Resultado recomendado:

```text
v20.20.2
```

Si ves `v18.19.1`, actualiza con `nvm` usando la sección 4.

## 9.3 Instalar dependencias

```bash
npm install
```

## 9.4 Ejecutar tests

```bash
npm test
```

Si los tests pasan, el MCP está funcionando localmente.

## 9.5 Obtener path absoluto del proyecto

```bash
pwd
```

Ejemplo:

```text
/root/github-repos/huaweicloud-deploy-mcp
```

El servidor MCP estará en:

```text
/root/github-repos/huaweicloud-deploy-mcp/server.mjs
```

Ajusta el path según tu máquina.

## 9.6 Configurar OpenCode para usar MCP con Node.js

Edita:

```bash
vim ~/.config/opencode/opencode.json
```

Presiona:

```text
i
```

Pega esta configuración, ajustando el path de `server.mjs`:

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

Guarda:

```text
Esc
:wq
Enter
```

---

# 10. Probar generación Terraform

Esta prueba aplica tanto para Docker como para Node.js local.

Ejecuta OpenCode:

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

Resultado esperado usando Docker:

```json
{
  "terraform_workspace_path": "/app/workspaces/rds-mysql-santiago",
  "terraform_workspace_host_path": "/mnt/d/huaweicloud-deploy-mcp-lab/workspaces/rds-mysql-santiago"
}
```

Resultado esperado usando Node.js local:

```json
{
  "terraform_workspace_path": "/mnt/d/huaweicloud-deploy-mcp-lab/workspaces/rds-mysql-santiago",
  "terraform_workspace_host_path": "/mnt/d/huaweicloud-deploy-mcp-lab/workspaces/rds-mysql-santiago"
}
```

Valida que existan los archivos:

```bash
ls -lah /mnt/d/huaweicloud-deploy-mcp-lab/workspaces/rds-mysql-santiago
```

Archivos esperados:

```text
main.tf
outputs.tf
providers.tf
terraform.tfvars.example
variables.tf
versions.tf
```

---

# 11. Validar Terraform generado

Define variables de trabajo:

```bash
export IMAGE="ghcr.io/magozcab/huaweicloud-deploy-mcp:latest"
export WORKSPACE_HOST="/mnt/d/huaweicloud-deploy-mcp-lab/workspaces/rds-mysql-santiago"
```

## 11.1 Revisar archivos

```bash
ls -lah "$WORKSPACE_HOST"
```

## 11.2 Verificar que no reaparezcan errores conocidos

```bash
grep -RIn 'la-north-2a' "$WORKSPACE_HOST" || echo "OK: no hardcoded la-north-2a"
```

```bash
grep -RIn 'protocol *= *"all"' "$WORKSPACE_HOST" || echo "OK: no invalid protocol all"
```

```bash
grep -RIn 'availability_zone\|rds.mysql\|3306' "$WORKSPACE_HOST"
```

## 11.3 Revisar formato Terraform

```bash
docker run --rm \
  -v "$WORKSPACE_HOST:/workspace" \
  -w /workspace \
  "$IMAGE" \
  terraform fmt -check -diff
```

Si el único problema es formato, puedes corregir con:

```bash
docker run --rm \
  -v "$WORKSPACE_HOST:/workspace" \
  -w /workspace \
  "$IMAGE" \
  terraform fmt -recursive
```

## 11.4 Inicializar Terraform

```bash
docker run --rm \
  -v "$WORKSPACE_HOST:/workspace" \
  -w /workspace \
  "$IMAGE" \
  terraform init -backend=false
```

## 11.5 Validar Terraform

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

# 12. Ejecutar terraform plan manualmente

No ejecutes `terraform plan` hasta tener credenciales Huawei Cloud.

Las credenciales deben pasarse por variables de entorno.

No las escribas en archivos `.tf`, `.tfvars`, `.env` ni en prompts.

## 12.1 Configurar variables de entorno

```bash
export HW_REGION_NAME="la-south-2"
export HW_ACCESS_KEY="replace_me"
export HW_SECRET_KEY="replace_me"
export TF_VAR_rds_password="replace_me"
```

## 12.2 Ejecutar plan

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

Solo muestra lo que Terraform intentaría crear, cambiar o eliminar.

## 12.3 Nota sobre disponibilidad regional

`terraform validate` valida sintaxis y estructura.

Pero no garantiza que un flavor exista en una región o availability zone específica.

Por ejemplo:

```text
rds.mysql.s1.small
```

puede no estar disponible en:

```text
la-south-2
la-south-2a
```

Si `terraform plan` falla por flavor no disponible, usa un flavor válido o integra discovery/pricing para seleccionar uno real.

---

# 13. Agregar Playwright MCP

Playwright MCP es opcional.

Sirve para que OpenCode pueda usar un navegador mediante MCP.

Puede ser útil para:

```text
Abrir documentación web
Inspeccionar páginas
Automatizar navegación
Validar consolas web
Extraer información de páginas
```

Hay dos opciones:

```text
Opción A: Playwright MCP con npx
Opción B: Playwright MCP con Docker
```

## 13.1 Opción A: Playwright MCP con npx

Verifica Node.js y npm:

```bash
node -v
npm -v
```

Prueba Playwright MCP fuera de OpenCode:

```bash
npx -y @playwright/mcp@latest --help
```

Si muestra ayuda, puedes integrarlo.

Edita OpenCode:

```bash
vim ~/.config/opencode/opencode.json
```

Ejemplo completo usando:

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

Prueba dentro de OpenCode:

```text
Use the playwright MCP to open https://www.example.com and tell me the page title.
```

## 13.2 Opción B: Playwright MCP con Docker

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

Configura Playwright MCP con Docker:

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

# 14. Troubleshooting

## 14.1 OpenCode no muestra el modelo MaaS

Revisa la configuración:

```bash
cat ~/.config/opencode/opencode.json
```

Verifica:

```text
baseURL
apiKey
models
```

Luego abre OpenCode:

```bash
opencode
```

Dentro de OpenCode:

```text
/models
```

## 14.2 OpenCode muestra MCP error -32000: Connection closed

Ese error significa que el MCP arrancó y se cerró inmediatamente.

Primero revisa si estás usando Node.js local:

```bash
grep -n '"huaweicloud-deploy"' -A35 ~/.config/opencode/opencode.json
```

Si ves:

```json
"command": [
  "node",
  "/root/github-repos/huaweicloud-deploy-mcp/server.mjs"
]
```

entonces estás usando modo Node.js local.

Valida Node.js:

```bash
node -v
```

Si ves:

```text
v18.19.1
```

actualiza:

```bash
nvm install 20.20.2
nvm use 20.20.2
```

Luego vuelve a probar:

```bash
cd ~/github-repos/huaweicloud-deploy-mcp
rm -rf node_modules
npm install
npm test
```

## 14.3 npm test falla con Unexpected token 'with'

Error típico:

```text
SyntaxError: Unexpected token 'with'
```

Causa:

```text
Node.js demasiado viejo para import attributes.
```

Solución:

```bash
nvm install 20.20.2
nvm use 20.20.2
npm test
```

## 14.4 Docker no puede montar el workspace

Valida que la carpeta exista:

```bash
ls -lah /mnt/d/huaweicloud-deploy-mcp-lab/workspaces
```

Si no existe:

```bash
mkdir -p /mnt/d/huaweicloud-deploy-mcp-lab/workspaces
```

Revisa que estas dos rutas coincidan:

```text
DEPLOY_WORKSPACE_HOST_BASE=/mnt/d/huaweicloud-deploy-mcp-lab/workspaces
```

```text
/mnt/d/huaweicloud-deploy-mcp-lab/workspaces:/app/workspaces
```

## 14.5 El MCP responde con /app/workspaces pero no veo archivos en el host

Eso indica que el contenedor escribió dentro de `/app/workspaces`, pero posiblemente el volumen no quedó bien montado.

Revisa el bloque Docker:

```json
"-v",
"/mnt/d/huaweicloud-deploy-mcp-lab/workspaces:/app/workspaces"
```

La parte izquierda debe existir en tu máquina:

```bash
ls -lah /mnt/d/huaweicloud-deploy-mcp-lab/workspaces
```

## 14.6 Terraform validate funciona pero plan falla

`terraform validate` no valida disponibilidad regional.

Puede pasar que el Terraform sea sintácticamente correcto, pero que un flavor no exista en la región.

Ejemplo:

```text
rds.mysql.s1.small
```

puede no existir en:

```text
la-south-2a
```

Solución:

```text
Usar un flavor válido para la región/AZ
o integrar discovery/pricing antes de generar Terraform final.
```

## 14.7 Playwright MCP no funciona

Prueba fuera de OpenCode:

```bash
npx -y @playwright/mcp@latest --help
```

Si usas Docker:

```bash
docker run --rm \
  --init \
  --pull=always \
  mcr.microsoft.com/playwright/mcp \
  --help
```

Si funciona fuera de OpenCode pero falla dentro, revisa el JSON:

```bash
cat ~/.config/opencode/opencode.json
```

---

# 15. Licencia

MIT

