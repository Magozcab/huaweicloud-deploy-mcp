---
name: outlook-email
description: Use when the user wants to check, read, search, or send email via Microsoft Outlook/365, manage their inbox, or send messages. Triggers on keywords like email, correo, outlook, inbox, bandeja, enviar email, leer email.
---

# Outlook Email via IMAP/SMTP

You have access to the `outlook` MCP server (`mcp-email`) which connects to Microsoft Outlook via IMAP/SMTP directly — no Azure needed.

## Setup (one-time)

The user needs to set two environment variables before starting opencode:

```bash
export EMAIL_USER="su-correo@outlook.com"
export EMAIL_PASSWORD="su-contraseña-de-aplicacion"
```

### How to get an App Password for Outlook.com

1. Go to https://account.microsoft.com/security
2. Advanced security options > App passwords
3. Create a new app password
4. Use that password as `EMAIL_PASSWORD` (NOT their normal login password)

If the user has a work/school Microsoft 365 account, they may use their regular password if their org allows IMAP access.

## Available Tools

| Tool | What it does |
|------|-------------|
| `send_email` | Send email (text, HTML, CC, BCC, attachments) |
| `get_recent_emails` | Get recent emails (by days and limit) |
| `get_email_content` | Read full content of a specific email by UID |
| `setup_email_account` | Configure/re-configure the email account |
| `test_email_connection` | Test SMTP/IMAP connection |
| `list_supported_providers` | List supported email providers |
| `configure_email_server` | Manual server configuration (advanced) |

## Common Workflows

### Check recent emails
Use `get_recent_emails` with `days=7` and `limit=20` to see recent messages.

### Read an email
Use `get_email_content` with the `uid` from the email list.

### Send an email
Use `send_email` with `to`, `subject`, and `text` (or `html`).

## Safety

- Always confirm with the user before sending emails
- Preview the email content before sending
