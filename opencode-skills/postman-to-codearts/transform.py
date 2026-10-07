#!/usr/bin/env python3
"""
Postman YAML → CodeArts TestPlan Native Transformation Script

Converts Postman v11 YAML export collections into Huawei Cloud CodeArts
TestPlan native API test case artifacts.

Usage:
    python3 transform.py --input CARGUEPostman.zip --env QA_ANH.environment.yaml --output codearts/
    python3 transform.py --input CARGUEPostman.zip pruebasPostman.zip --env QA_ANH.environment.yaml --output codearts/ --fix-quality
    python3 transform.py --input CARGUEPostman.zip --env QA_ANH.environment.yaml --output codearts/ --dry-run
"""

import argparse
import json
import os
import re
import sys
import zipfile
from collections import OrderedDict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import yaml
except ImportError:
    print("ERROR: PyYAML required. Install with: pip install pyyaml")
    sys.exit(1)


# ─── Constants ────────────────────────────────────────────────────────────────

SEVERITY_HIGH = "HIGH"
SEVERITY_MEDIUM = "MEDIUM"
SEVERITY_LOW = "LOW"

JWT_PATTERN = re.compile(r"eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+")
CREDENTIAL_PATTERNS = [
    re.compile(r"Admin\.ANH_\d{4}", re.IGNORECASE),
    re.compile(r"ANH_Test\d{4}!\*", re.IGNORECASE),
    re.compile(r"password['\"]?\s*[:=]\s*['\"][^'\"]{6,}['\"]", re.IGNORECASE),
]
LOCAL_PATH_PATTERN = re.compile(r"^/[A-Z]:/")
POSTMAN_CLOUD_PATTERN = re.compile(r"postman-cloud://")

SUITE_AUTH = "SUITE-AUTH"
SUITE_UPLOAD = "SUITE-UPLOAD"
SUITE_API = "SUITE-API"

AUTH_PATHS = ["/api/auth/login", "/oauth2/token", "/api/auth/"]
UPLOAD_PATHS = ["/api/reporte/upload", "/api/reporte/upload", "/api/Reporte/upload"]

CASE_PREFIX_AUTH = "TC-AUTH"
CASE_PREFIX_UPLOAD = "TC-UPLOAD"
CASE_PREFIX_API = "TC-API"


# ─── Data Classes ─────────────────────────────────────────────────────────────

class QualityIssue:
    def __init__(self, request_name: str, issue_type: str, severity: str, description: str, fix_hint: str = ""):
        self.request_name = request_name
        self.issue_type = issue_type
        self.severity = severity
        self.description = description
        self.fix_hint = fix_hint

    def to_dict(self):
        return {
            "request_name": self.request_name,
            "issue_type": self.issue_type,
            "severity": self.severity,
            "description": self.description,
            "fix_hint": self.fix_hint,
        }


class ParsedRequest:
    def __init__(self, name: str, data: dict, collection_name: str, filename: str):
        self.name = name
        self.data = data
        self.collection_name = collection_name
        self.filename = filename
        self.issues: List[QualityIssue] = []
        self.suite_id = ""
        self.case_id = ""
        self.is_duplicate = False
        self.duplicate_of = ""


# ─── Parsing ──────────────────────────────────────────────────────────────────

def parse_environment(env_path: str) -> dict:
    with open(env_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data


def parse_zip(zip_path: str) -> Tuple[dict, List[ParsedRequest]]:
    collection_vars = {}
    requests = []
    collection_name = Path(zip_path).stem

    with zipfile.ZipFile(zip_path, "r") as zf:
        for name in zf.namelist():
            if name.endswith("definition.yaml"):
                with zf.open(name) as f:
                    defn = yaml.safe_load(f)
                    if defn and "variables" in defn:
                        collection_vars = defn["variables"]

            elif name.endswith(".request.yaml"):
                with zf.open(name) as f:
                    try:
                        data = yaml.safe_load(f)
                    except yaml.YAMLError as e:
                        print(f"  WARN: Cannot parse {name}: {e}")
                        continue

                if not data:
                    continue

                base = Path(name).stem.replace(".request", "")
                req_name = data.get("name", base) or base
                requests.append(ParsedRequest(
                    name=req_name,
                    data=data,
                    collection_name=collection_name,
                    filename=name,
                ))

    return collection_vars, requests


# ─── Quality Detection ────────────────────────────────────────────────────────

def detect_quality_issues(req: ParsedRequest):
    data = req.data

    # 1. Hardcoded JWT
    auth = data.get("auth", {})
    if isinstance(auth, dict):
        creds = auth.get("credentials", {})
        token = creds.get("token", "") if isinstance(creds, dict) else ""
        if token and JWT_PATTERN.search(str(token)):
            req.issues.append(QualityIssue(
                req.name, "HARDCODED_JWT", SEVERITY_HIGH,
                "Bearer token contains hardcoded JWT",
                "Replace with {{authToken}} and add extract in login step"
            ))

    # 2. Empty request
    url = data.get("url", "")
    if not url or (isinstance(url, str) and url.strip() == ""):
        has_body = bool(data.get("body", {}))
        has_tests = any(s.get("type") == "afterResponse" for s in data.get("scripts", []))
        if not has_body and not has_tests:
            req.issues.append(QualityIssue(
                req.name, "EMPTY_REQUEST", SEVERITY_HIGH,
                "Request has no URL, body, or tests",
                "Implement URL, body, and assertions based on test case name"
            ))

    # 3. Exposed credentials in body
    body = data.get("body", {})
    if isinstance(body, dict):
        content = str(body.get("content", ""))
        for pat in CREDENTIAL_PATTERNS:
            if pat.search(content):
                req.issues.append(QualityIssue(
                    req.name, "EXPOSED_CREDENTIALS", SEVERITY_HIGH,
                    f"Body contains literal credentials matching {pat.pattern}",
                    "Replace with {{variable}} and add to environment with sensitive=true"
                ))
                break

    # 4. Exposed credentials in scripts
    for script in data.get("scripts", []):
        code = script.get("code", "")
        for pat in CREDENTIAL_PATTERNS:
            if pat.search(code):
                req.issues.append(QualityIssue(
                    req.name, "EXPOSED_CREDENTIALS_SCRIPT", SEVERITY_HIGH,
                    f"Script contains literal credentials matching {pat.pattern}",
                    "Replace with env.get()/env.set() using environment variables"
                ))
                break

    # 5. Misplaced success code
    for script in data.get("scripts", []):
        if script.get("type") == "afterResponse":
            code = script.get("code", "")
            if "oneOf" in code:
                name_lower = req.name.lower()
                if any(w in name_lower for w in ["exitoso", "successful", "exito", "valid"]):
                    if "401" in code or "500" in code:
                        req.issues.append(QualityIssue(
                            req.name, "MISPLACED_SUCCESS_CODE", SEVERITY_HIGH,
                            "Success test accepts error status codes (401/500)",
                            "Remove error codes from oneOf() in success assertions"
                        ))

    # 6. Empty formdata body
    body = data.get("body", {})
    if isinstance(body, dict):
        if body.get("type") == "formdata":
            content = body.get("content", [])
            if isinstance(content, list) and len(content) == 0:
                req.issues.append(QualityIssue(
                    req.name, "EMPTY_FORMDATA", SEVERITY_MEDIUM,
                    "Form-data body is empty (no fields or files)",
                    "Add expected file and form fields"
                ))

    # 7. No post-response tests
    has_post_test = False
    for script in data.get("scripts", []):
        if script.get("type") == "afterResponse":
            code = script.get("code", "").strip()
            if code and code != "// No tests currently defined." and "pm.test" in code:
                has_post_test = True
    if not has_post_test:
        req.issues.append(QualityIssue(
            req.name, "NO_POST_TESTS", SEVERITY_MEDIUM,
            "Request has no post-response test assertions",
            "Add checkpoints for status code and response time at minimum"
        ))

    # 8. Local file paths
    body = data.get("body", {})
    if isinstance(body, dict):
        for item in body.get("content", []) if isinstance(body.get("content"), list) else []:
            src = item.get("src", [])
            if isinstance(src, list):
                for s in src:
                    if LOCAL_PATH_PATTERN.match(str(s)):
                        req.issues.append(QualityIssue(
                            req.name, "LOCAL_FILE_PATH", SEVERITY_LOW,
                            f"File reference uses local Windows path: {s}",
                            "Convert to test-data/<filename> relative path"
                        ))
                    if POSTMAN_CLOUD_PATTERN.match(str(s)):
                        req.issues.append(QualityIssue(
                            req.name, "POSTMAN_CLOUD_URI", SEVERITY_LOW,
                            f"File reference uses postman-cloud:// URI: {s}",
                            "Convert to test-data/<descriptive-name>.json relative path"
                        ))


def detect_duplicates(requests: List[ParsedRequest]):
    seen = {}
    for req in requests:
        data = req.data
        url = str(data.get("url", "")).strip()
        method = data.get("method", "")
        body_content = ""
        body = data.get("body", {})
        if isinstance(body, dict):
            body_content = str(body.get("content", ""))[:200]
        key = f"{method}|{url}|{body_content}"

        if key in seen:
            req.is_duplicate = True
            req.duplicate_of = seen[key].name
            req.issues.append(QualityIssue(
                req.name, "DUPLICATE_REQUEST", SEVERITY_LOW,
                f"Duplicate of {seen[key].name} (same URL, method, body)",
                "Remove or merge with the original request"
            ))
        else:
            seen[key] = req


# ─── Classification ───────────────────────────────────────────────────────────

def classify_request(req: ParsedRequest) -> str:
    url = str(req.data.get("url", "")).lower()
    for path in AUTH_PATHS:
        if path.lower() in url:
            return SUITE_AUTH
    for path in UPLOAD_PATHS:
        if path.lower() in url:
            return SUITE_UPLOAD
    return SUITE_API


# ─── URL Transformation ───────────────────────────────────────────────────────

def transform_url(url: str) -> str:
    url = url.strip()
    if not url:
        return ""

    domain_patterns = [
        r"https?://devqaidp-api\.anh\.gov\.co",
        r"https?://devqaidp\.anh\.gov\.co",
    ]
    for pat in domain_patterns:
        url = re.sub(pat, "{{base_url}}", url)

    url = re.sub(r"\{\{gateway\}\}", "{{base_url}}", url)
    url = re.sub(r"/api/Auth/", "/api/auth/", url)
    url = re.sub(r"/api/Reporte/", "/api/reporte/", url)

    return url


# ─── Headers Transformation ───────────────────────────────────────────────────

def transform_headers(data: dict) -> List[dict]:
    headers = []
    raw_headers = data.get("headers", {})

    if isinstance(raw_headers, dict):
        for k, v in raw_headers.items():
            headers.append({"key": k, "value": str(v)})
    elif isinstance(raw_headers, list):
        for h in raw_headers:
            if isinstance(h, dict) and not h.get("disabled", False):
                headers.append({"key": h.get("key", ""), "value": str(h.get("value", ""))})

    auth = data.get("auth", {})
    if isinstance(auth, dict) and auth.get("type") == "bearer":
        creds = auth.get("credentials", {})
        token = creds.get("token", "") if isinstance(creds, dict) else ""
        if token and not JWT_PATTERN.search(str(token)):
            has_auth = any(h["key"] == "Authorization" for h in headers)
            if not has_auth:
                headers.append({"key": "Authorization", "value": f"Bearer {token}"})

    return headers


# ─── Body Transformation ──────────────────────────────────────────────────────

def transform_body(data: dict, fix_quality: bool = False) -> Tuple[str, Any]:
    body = data.get("body", {})
    if not body or not isinstance(body, dict):
        return "none", None

    body_type = body.get("type", "")
    content = body.get("content")

    if body_type == "json":
        return "json", content
    elif body_type == "formdata":
        items = []
        if isinstance(content, list):
            for item in content:
                if item.get("disabled", False):
                    continue
                key = item.get("key", "")
                item_type = item.get("type", "text")
                if item_type == "file":
                    src = item.get("src", [])
                    if isinstance(src, list) and len(src) > 0:
                        path_val = src[0]
                        if LOCAL_PATH_PATTERN.match(str(path_val)):
                            filename = Path(str(path_val)).name
                            path_val = f"test-data/{filename}"
                        elif POSTMAN_CLOUD_PATTERN.match(str(path_val)):
                            path_val = f"test-data/{key}_placeholder.json"
                        items.append({"key": key, "type": "file", "value": path_val})
                    else:
                        items.append({"key": key, "type": "file", "value": f"test-data/{key}_placeholder.json"})
                else:
                    items.append({"key": key, "type": "text", "value": item.get("value", "")})
        return "form-data", items
    elif body_type == "urlencoded":
        if isinstance(content, dict):
            pairs = [{"key": k, "value": str(v)} for k, v in content.items()]
            return "x-www-form-urlencoded", pairs
        return "x-www-form-urlencoded", content
    elif body_type == "raw":
        return "raw", content
    else:
        return "none", None


# ─── Script Transformation ────────────────────────────────────────────────────

def convert_pre_script(code: str) -> str:
    if not code:
        return ""
    code = re.sub(r"pm\.variables\.set\(", "env.set(", code)
    code = re.sub(r"pm\.environment\.set\(", "env.set(", code)
    code = re.sub(r"pm\.environment\.get\(", "env.get(", code)
    code = re.sub(r"pm\.variables\.get\(", "env.get(", code)
    code = re.sub(r"pm\.variables\.replaceIn\(", "env.replaceIn(", code)
    code = re.sub(r"\{\{\$guid\}\}", "utils.uuid()", code)
    code = re.sub(r"\{\{\$timestamp\}\}", "Math.floor(Date.now() / 1000)", code)
    code = re.sub(r"\{\{\$randomInt\}\}", "Math.floor(Math.random() * 1000)", code)

    for pat in CREDENTIAL_PATTERNS:
        code = pat.sub("{{REDACTED_CREDENTIAL}}", code)

    return code


def convert_post_script(code: str) -> str:
    if not code:
        return ""
    code = re.sub(r"pm\.response\.code", "response.status", code)
    code = re.sub(r"pm\.response\.responseTime", "response.time", code)
    code = re.sub(r"pm\.response\.json\(\)", "response.json()", code)
    code = re.sub(r"pm\.response\.text\(\)", "response.text()", code)
    code = re.sub(r"pm\.response\.isJson", "response.isJson", code)
    code = re.sub(r"pm\.response\.headers\.get\(\s*['\"]([^'\"]+)['\"]\s*\)", r'response.headers["\1"]', code)
    code = re.sub(r"pm\.environment\.set\(", "env.set(", code)
    code = re.sub(r"pm\.variables\.set\(", "env.set(", code)

    for pat in CREDENTIAL_PATTERNS:
        code = pat.sub("{{REDACTED_CREDENTIAL}}", code)

    return code


# ─── Assertion Decomposition ──────────────────────────────────────────────────

def decompose_assertions(code: str) -> Tuple[List[dict], List[dict], str]:
    checkpoints = []
    extracts = []
    residual_lines = []

    if not code or "pm.test" not in code:
        return checkpoints, extracts, code

    test_blocks = re.findall(r'pm\.test\(\s*["\']([^"\']+)["\']\s*,\s*function\s*\(\)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}\s*\)', code, re.DOTALL)

    if not test_blocks:
        return checkpoints, extracts, code

    for test_name, test_body in test_blocks:
        test_body = test_body.strip()
        converted = False

        # Status code equals
        m = re.search(r'pm\.response\.to\.have\.status\((\d+)\)', test_body)
        if m:
            checkpoints.append({
                "name": test_name,
                "type": "STATUS_CODE",
                "operator": "EQUALS",
                "value": m.group(1),
                "required": True,
            })
            converted = True

        # Status code oneOf
        m = re.search(r'pm\.expect\(pm\.response\.code\)\.to\.be\.oneOf\(\[([^\]]+)\]\)', test_body)
        if m:
            codes = re.findall(r'\d+', m.group(1))
            checkpoints.append({
                "name": test_name,
                "type": "STATUS_CODE",
                "operator": "IN",
                "value": ",".join(codes),
                "required": True,
            })
            converted = True

        # Status code not equal
        m = re.search(r'pm\.expect\(pm\.response\.code\)\.to\.not\.equal\((\d+)\)', test_body)
        if m:
            checkpoints.append({
                "name": test_name,
                "type": "STATUS_CODE",
                "operator": "NOT_EQUALS",
                "value": m.group(1),
                "required": True,
            })
            converted = True

        # Response time below
        m = re.search(r'pm\.expect\(pm\.response\.responseTime\)\.to\.be\.below\((\d+)\)', test_body)
        if m:
            checkpoints.append({
                "name": test_name,
                "type": "RESPONSE_TIME",
                "operator": "LESS_THAN",
                "value": m.group(1),
                "required": True,
            })
            converted = True

        # JSON property exists
        m = re.search(r'pm\.expect\([^)]+\)\.to\.have\.property\(["\'](\w+)["\']\)', test_body)
        if m:
            prop = m.group(1)
            checkpoints.append({
                "name": test_name,
                "type": "JSON_PATH",
                "operator": "EXISTS",
                "value": f"$.{prop}",
                "required": True,
            })
            converted = True

        # Body contains
        m = re.search(r'pm\.expect\([^)]+\)\.to\.include\(["\']([^"\']+)["\']\)', test_body)
        if m:
            checkpoints.append({
                "name": test_name,
                "type": "BODY_CONTAINS",
                "operator": "CONTAINS",
                "value": m.group(1),
                "required": True,
            })
            converted = True

        # Body not contains
        m = re.search(r'pm\.expect\([^)]+\)\.to\.not\.include\(["\']([^"\']+)["\']\)', test_body)
        if m:
            checkpoints.append({
                "name": test_name,
                "type": "BODY_CONTAINS",
                "operator": "NOT_CONTAINS",
                "value": m.group(1),
                "required": True,
            })
            converted = True

        # Variable extraction (pm.environment.set after response parsing)
        m = re.search(r'pm\.environment\.set\(["\'](\w+)["\']\s*,\s*(\w+)\)', test_body)
        if m:
            var_name = m.group(1)
            source_var = m.group(2)
            expr = f"$.{var_name}"
            if "token" in var_name.lower() or "token" in source_var.lower():
                expr = "$.token"
            extracts.append({
                "name": var_name,
                "type": "JSON_PATH",
                "expression": expr,
                "required": True,
            })

        if not converted:
            residual_lines.append(f"// {test_name}")
            residual_lines.append(convert_post_script(test_body))

    residual = "\n".join(residual_lines).strip() if residual_lines else ""
    return checkpoints, extracts, residual


# ─── Quality Fixes ────────────────────────────────────────────────────────────

def apply_quality_fixes(req: ParsedRequest, data: dict) -> dict:
    for issue in req.issues:
        if issue.issue_type == "HARDCODED_JWT":
            auth = data.get("auth", {})
            if isinstance(auth, dict) and auth.get("type") == "bearer":
                creds = auth.get("credentials", {})
                if isinstance(creds, dict):
                    creds["token"] = "{{authToken}}"

        elif issue.issue_type == "MISPLACED_SUCCESS_CODE":
            for script in data.get("scripts", []):
                if script.get("type") == "afterResponse":
                    code = script.get("code", "")
                    code = re.sub(r'\[200,\s*201,\s*401\]', '[200, 201]', code)
                    code = re.sub(r'\[200,\s*401,\s*201\]', '[200, 201]', code)
                    code = re.sub(r'\[201,\s*200,\s*401\]', '[200, 201]', code)
                    script["code"] = code

    return data


# ─── Case Generation ──────────────────────────────────────────────────────────

def determine_priority(req: ParsedRequest) -> int:
    name_lower = req.name.lower()
    if any(w in name_lower for w in ["exitoso", "successful", "exito", "valid", "front"]):
        return 0
    if any(w in name_lower for w in ["satanizar", "sql", "xss", "security"]):
        return 1
    if any(w in name_lower for w in ["rate", "limit", "estres"]):
        return 1
    if any(w in name_lower for w in ["invalido", "incorrecta", "fallido", "incompleto", "obligatorio"]):
        return 1
    return 2


def determine_tags(req: ParsedRequest) -> List[str]:
    tags = []
    name_lower = req.name.lower()

    if req.suite_id == SUITE_AUTH:
        tags.append("auth")
    elif req.suite_id == SUITE_UPLOAD:
        tags.append("upload")
    else:
        tags.append("api")

    if any(w in name_lower for w in ["exitoso", "successful", "exito", "valid"]):
        tags.append("positive")
    if any(w in name_lower for w in ["invalido", "incorrecta", "fallido", "incompleto", "vacio", "malformado", "mal armado"]):
        tags.append("negative")
    if any(w in name_lower for w in ["satanizar", "sql", "xss"]):
        tags.append("security")
    if any(w in name_lower for w in ["rate", "limit", "estres"]):
        tags.append("performance")
    if any(w in name_lower for w in ["incoherente", "boundary"]):
        tags.append("boundary")

    priority = determine_priority(req)
    tags.append(f"p{priority}")

    if priority == 0:
        tags.append("smoke")

    return tags


def generate_test_case(req: ParsedRequest, case_num: int, fix_quality: bool = False) -> dict:
    data = req.data
    if fix_quality:
        data = apply_quality_fixes(req, data)

    prefix = CASE_PREFIX_AUTH if req.suite_id == SUITE_AUTH else (CASE_PREFIX_UPLOAD if req.suite_id == SUITE_UPLOAD else CASE_PREFIX_API)
    case_id = f"{prefix}-{case_num:03d}"
    req.case_id = case_id

    url = transform_url(str(data.get("url", "")))
    method = data.get("method", "GET")
    headers = transform_headers(data)
    body_type, body_content = transform_body(data, fix_quality)

    pre_script = ""
    post_script = ""
    checkpoints = []
    extracts = []
    for script in data.get("scripts", []):
        if script.get("type") == "beforeRequest":
            pre_script = convert_pre_script(script.get("code", ""))
        elif script.get("type") == "afterResponse":
            raw_post = script.get("code", "")
            cp, ext, residual = decompose_assertions(raw_post)
            checkpoints.extend(cp)
            extracts.extend(ext)
            if residual:
                post_script = residual

    request_obj = {
        "url": url,
        "method": method,
        "headers": headers,
        "body_type": body_type,
    }
    if body_type != "none" and body_content is not None:
        request_obj["body"] = body_content

    step = {
        "step_id": 1,
        "name": f"{method} {url}",
        "request": request_obj,
        "pre_script": pre_script,
        "post_script": post_script,
        "check_points": checkpoints,
        "extracts": extracts,
    }

    source = {
        "postman_collection": req.collection_name,
        "postman_request": req.filename,
    }
    if req.issues:
        fixes = [i for i in req.issues if fix_quality and i.issue_type in ("HARDCODED_JWT", "MISPLACED_SUCCESS_CODE")]
        if fixes:
            source["quality_fix"] = "; ".join(f.fix_hint for f in fixes)

    return {
        "case_id": case_id,
        "name": req.name,
        "type": "API",
        "priority": determine_priority(req),
        "suite_id": req.suite_id,
        "tags": determine_tags(req),
        "source": source,
        "preconditions": "",
        "steps": [step],
    }


# ─── Artifact Generation ──────────────────────────────────────────────────────

def generate_project(project_name: str, requests: List[ParsedRequest], total_source: int, removed: List[str]) -> dict:
    return {
        "project_name": project_name,
        "project_type": "testplan",
        "description": f"Plan de pruebas API - Generated from Postman collections",
        "created_from": {
            "source_format": "postman_yaml_v11",
            "transformation_date": datetime.now().strftime("%Y-%m-%d"),
            "total_source_requests": total_source,
            "total_useful_cases": len([r for r in requests if not r.is_duplicate]),
            "cases_removed": [{"name": n, "reason": "duplicate"} for n in removed],
        },
    }


def generate_environment(env_data: dict, collection_vars: dict) -> dict:
    variables = []
    if isinstance(env_data, dict) and "values" in env_data:
        for v in env_data["values"]:
            variables.append({
                "name": v.get("key", ""),
                "value": v.get("value", ""),
                "description": v.get("description", ""),
                "sensitive": any(w in v.get("key", "").lower() for w in ["password", "token", "secret", "auth"]),
            })

    if isinstance(collection_vars, dict):
        for k, v in collection_vars.items():
            if not any(ev["name"] == k for ev in variables):
                variables.append({"name": k, "value": str(v) if v else "", "description": "", "sensitive": False})

    return {
        "name": env_data.get("name", "QA_Environment") if isinstance(env_data, dict) else "QA_Environment",
        "description": "Variables de entorno para ejecución de pruebas API en CodeArts TestPlan",
        "variables": variables,
    }


def generate_testplan(plan_name: str, suites: dict) -> dict:
    suite_list = []
    for suite_id, suite_info in suites.items():
        suite_list.append({
            "suite_id": suite_id,
            "name": suite_info["name"],
            "description": suite_info["description"],
            "order": suite_info["order"],
            "case_count": len(suite_info["cases"]),
        })

    return {
        "name": plan_name,
        "description": "Plan de pruebas API generado desde colecciones Postman",
        "version": "1.0.0",
        "suites": suite_list,
        "execution_strategy": {
            "sequential_suites": True,
            "suite_order": [s["suite_id"] for s in sorted(suite_list, key=lambda x: x["order"])],
            "rationale": "Auth suite must run first to populate {{authToken}} for Upload suite"
        },
        "total_cases": sum(s["case_count"] for s in suite_list),
    }


def generate_suite(suite_id: str, name: str, description: str, cases: List[dict]) -> dict:
    return {
        "suite_id": suite_id,
        "name": name,
        "description": description,
        "order": 1 if "AUTH" in suite_id else 2,
        "cases": [
            {
                "case_id": c["case_id"],
                "name": c["name"],
                "priority": c["priority"],
                "tags": c["tags"],
                "file": f"cases/{'auth' if 'AUTH' in suite_id else 'upload'}/{c['case_id']}.json",
            }
            for c in cases
        ],
    }


# ─── Validation ───────────────────────────────────────────────────────────────

def validate_artifacts(cases: List[dict], env_data: dict) -> List[str]:
    errors = []

    case_ids = [c["case_id"] for c in cases]
    if len(case_ids) != len(set(case_ids)):
        errors.append("Duplicate case IDs found")

    env_vars = set()
    if isinstance(env_data, dict) and "variables" in env_data:
        env_vars = {v["name"] for v in env_data["variables"]}

    for c in cases:
        content = json.dumps(c)
        referenced = set(re.findall(r"\{\{(\w+)\}\}", content))
        missing = referenced - env_vars
        if missing:
            errors.append(f"{c['case_id']}: references undefined variables: {missing}")

    return errors


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Postman YAML → CodeArts TestPlan Transformation")
    parser.add_argument("--input", nargs="+", required=True, help="Input Postman ZIP files")
    parser.add_argument("--env", required=True, help="Environment YAML file")
    parser.add_argument("--output", required=True, help="Output directory for CodeArts artifacts")
    parser.add_argument("--fix-quality", action="store_true", help="Auto-fix quality issues")
    parser.add_argument("--dry-run", action="store_true", help="Report only, don't write files")
    parser.add_argument("--project-name", default="QA_API", help="Project name (default: QA_API)")
    args = parser.parse_args()

    print("=" * 60)
    print("Postman YAML → CodeArts TestPlan Transformation")
    print("=" * 60)

    # Parse environment
    print(f"\n[1/7] Parsing environment: {args.env}")
    env_data = parse_environment(args.env)

    # Parse all collections
    print(f"\n[2/7] Parsing {len(args.input)} collection(s)...")
    all_requests: List[ParsedRequest] = []
    all_collection_vars = {}
    total_source = 0

    for zip_path in args.input:
        print(f"  → {zip_path}")
        coll_vars, requests = parse_zip(zip_path)
        all_collection_vars.update(coll_vars if isinstance(coll_vars, dict) else {})
        all_requests.extend(requests)
        total_source += len(requests)
        print(f"    {len(requests)} requests found")

    # Detect quality issues
    print(f"\n[3/7] Detecting quality issues...")
    for req in all_requests:
        detect_quality_issues(req)
    detect_duplicates(all_requests)

    all_issues = [i for req in all_requests for i in req.issues]
    high = [i for i in all_issues if i.severity == SEVERITY_HIGH]
    medium = [i for i in all_issues if i.severity == SEVERITY_MEDIUM]
    low = [i for i in all_issues if i.severity == SEVERITY_LOW]

    print(f"  HIGH: {len(high)}  MEDIUM: {len(medium)}  LOW: {len(low)}  TOTAL: {len(all_issues)}")
    for i in high:
        print(f"    ❌ [{i.severity}] {i.request_name}: {i.description}")
    for i in medium:
        print(f"    ⚠  [{i.severity}] {i.request_name}: {i.description}")
    for i in low:
        print(f"    ℹ  [{i.severity}] {i.request_name}: {i.description}")

    # Classify into suites
    print(f"\n[4/7] Classifying requests into suites...")
    for req in all_requests:
        req.suite_id = classify_request(req)

    suite_counts = {}
    for req in all_requests:
        suite_counts[req.suite_id] = suite_counts.get(req.suite_id, 0) + 1
    for sid, count in sorted(suite_counts.items()):
        print(f"  {sid}: {count} requests")

    # Filter duplicates
    useful_requests = [r for r in all_requests if not r.is_duplicate]
    removed = [r.name for r in all_requests if r.is_duplicate]
    print(f"  Duplicates removed: {len(removed)} → Useful cases: {len(useful_requests)}")

    # Transform and generate cases
    print(f"\n[5/7] Generating CodeArts test cases...")
    suite_cases = {SUITE_AUTH: [], SUITE_UPLOAD: [], SUITE_API: []}
    suite_counters = {SUITE_AUTH: 0, SUITE_UPLOAD: 0, SUITE_API: 0}

    for req in useful_requests:
        suite_counters[req.suite_id] += 1
        case = generate_test_case(req, suite_counters[req.suite_id], args.fix_quality)
        suite_cases[req.suite_id].append(case)
        print(f"  {case['case_id']}: {case['name']} (priority={case['priority']}, tags={case['tags']})")

    # Generate environment
    codearts_env = generate_environment(env_data, all_collection_vars)

    # Validate
    print(f"\n[6/7] Validating artifacts...")
    all_cases = []
    for cases in suite_cases.values():
        all_cases.extend(cases)
    errors = validate_artifacts(all_cases, codearts_env)
    if errors:
        print(f"  {len(errors)} validation error(s):")
        for e in errors:
            print(f"    ❌ {e}")
    else:
        print(f"  ✅ All {len(all_cases)} cases validated successfully")

    # Write output
    print(f"\n[7/7] Writing output to: {args.output}")
    if args.dry_run:
        print("  (dry-run mode — no files written)")
        print(f"\n  Would generate {len(all_cases)} cases in {len([s for s in suite_cases.values() if s])} suites")
        return

    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)

    # Project
    project = generate_project(args.project_name, useful_requests, total_source, removed)
    with open(output / "project.json", "w", encoding="utf-8") as f:
        json.dump(project, f, indent=2, ensure_ascii=False)

    # Environment
    with open(output / "environment.json", "w", encoding="utf-8") as f:
        json.dump(codearts_env, f, indent=2, ensure_ascii=False)

    # Suites and cases
    suites_dir = output / "suites"
    suites_dir.mkdir(exist_ok=True)

    suite_defs = {
        SUITE_AUTH: {"name": "Autenticación", "description": "Casos de prueba para /api/auth/login y /oauth2/token"},
        SUITE_UPLOAD: {"name": "Carga de Reportes", "description": "Casos de prueba para /api/reporte/upload"},
        SUITE_API: {"name": "API General", "description": "Casos de prueba para endpoints generales"},
    }

    plan_suites = {}
    for suite_id, cases in suite_cases.items():
        if not cases:
            continue
        info = suite_defs[suite_id]
        sub_dir = "auth" if "AUTH" in suite_id else ("upload" if "UPLOAD" in suite_id else "api")
        cases_dir = output / "cases" / sub_dir
        cases_dir.mkdir(parents=True, exist_ok=True)

        for case in cases:
            with open(cases_dir / f"{case['case_id']}.json", "w", encoding="utf-8") as f:
                json.dump(case, f, indent=2, ensure_ascii=False)

        suite = generate_suite(suite_id, info["name"], info["description"], cases)
        with open(suites_dir / f"suite-{sub_dir}.json", "w", encoding="utf-8") as f:
            json.dump(suite, f, indent=2, ensure_ascii=False)

        merged = dict(info)
        merged["order"] = 1 if "AUTH" in suite_id else 2
        merged["cases"] = cases
        plan_suites[suite_id] = merged

    # TestPlan
    testplan = generate_testplan(f"Plan-{args.project_name}-v1", plan_suites)
    with open(output / "testplan.json", "w", encoding="utf-8") as f:
        json.dump(testplan, f, indent=2, ensure_ascii=False)

    # Test data directory
    test_data_dir = output / "test-data"
    test_data_dir.mkdir(exist_ok=True)
    with open(test_data_dir / ".gitkeep", "w") as f:
        f.write("")

    # Quality report
    report = {
        "transformation_date": datetime.now().isoformat(),
        "source_files": args.input,
        "total_source_requests": total_source,
        "useful_cases": len(useful_requests),
        "duplicates_removed": removed,
        "quality_issues": {
            "high": [i.to_dict() for i in high],
            "medium": [i.to_dict() for i in medium],
            "low": [i.to_dict() for i in low],
        },
        "validation_errors": errors,
        "suites": {sid: len(cases) for sid, cases in suite_cases.items() if cases},
    }
    with open(output / "quality-report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"\n  ✅ Generated {len(all_cases)} cases in {len(plan_suites)} suites")
    print(f"  ✅ Quality report: {output}/quality-report.json")
    print(f"  ✅ Artifacts written to: {output}/")


if __name__ == "__main__":
    main()
