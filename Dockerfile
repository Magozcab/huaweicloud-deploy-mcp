FROM node:20-bookworm-slim

ARG TERRAFORM_VERSION=1.15.6

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip git \
  && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
  ARCH="$(dpkg --print-architecture)"; \
  case "$ARCH" in \
    amd64) TF_ARCH="amd64" ;; \
    arm64) TF_ARCH="arm64" ;; \
    *) echo "Unsupported architecture: $ARCH" && exit 1 ;; \
  esac; \
  curl -fsSL "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_${TF_ARCH}.zip" -o /tmp/terraform.zip; \
  unzip /tmp/terraform.zip -d /usr/local/bin; \
  chmod +x /usr/local/bin/terraform; \
  rm -f /tmp/terraform.zip; \
  terraform version

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /app/workspaces

ENV DEPLOY_WORKSPACE_BASE=/app/workspaces

CMD ["node", "server.mjs"]
