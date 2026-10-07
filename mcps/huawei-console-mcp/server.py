#!/usr/bin/env python3
import asyncio
import json
import sys
import os
import traceback
import base64
from typing import Any, Dict, Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from browser_manager import BrowserManager

bm = BrowserManager()

SCREENSHOTS_DIR = os.environ.get("SCREENSHOTS_DIR", "/root/codearts/.secure/screenshots")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

TOOLS = [
    {
        "name": "console_login",
        "description": "Login to Huawei Cloud console. Handles Huawei ID + password + MFA. Returns login status and cookies. If MFA is required, returns status='mfa_required' - call console_submit_mfa next.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "huawei_id": {"type": "string", "description": "Huawei Cloud account email/phone/ID"},
                "password": {"type": "string", "description": "Account password"},
                "region": {"type": "string", "description": "Target region after login (default: la-south-2)", "default": "la-south-2"},
            },
            "required": ["huawei_id", "password"],
        },
    },
    {
        "name": "console_submit_mfa",
        "description": "Submit MFA verification code after login. Call this when console_login returns status='mfa_required'.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "mfa_code": {"type": "string", "description": "6-digit MFA code from virtual MFA device"},
            },
            "required": ["mfa_code"],
        },
    },
    {
        "name": "console_navigate",
        "description": "Navigate browser to a URL. Returns page title and URL after navigation.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL to navigate to"},
                "wait_seconds": {"type": "number", "description": "Seconds to wait after navigation (default: 3)", "default": 3},
            },
            "required": ["url"],
        },
    },
    {
        "name": "console_screenshot",
        "description": "Take a screenshot of the current page. Returns base64-encoded image.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "full_page": {"type": "boolean", "description": "Capture full page (default: false)", "default": False},
                "selector": {"type": "string", "description": "Optional CSS selector to screenshot specific element"},
            },
        },
    },
    {
        "name": "console_get_page_info",
        "description": "Get current page URL, title, and visible text content.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "max_text_length": {"type": "number", "description": "Max characters of visible text to return (default: 2000)", "default": 2000},
            },
        },
    },
    {
        "name": "console_click",
        "description": "Click on an element by CSS selector or text.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "selector": {"type": "string", "description": "CSS selector of element to click"},
                "text": {"type": "string", "description": "Text content to find and click (alternative to selector)"},
                "wait_after": {"type": "number", "description": "Seconds to wait after click (default: 2)", "default": 2},
            },
        },
    },
    {
        "name": "console_fill",
        "description": "Fill an input field with a value.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "selector": {"type": "string", "description": "CSS selector of input field"},
                "value": {"type": "string", "description": "Value to fill"},
                "press_enter": {"type": "boolean", "description": "Press Enter after filling (default: false)", "default": False},
            },
            "required": ["selector", "value"],
        },
    },
    {
        "name": "console_wait_for",
        "description": "Wait for an element to appear on the page.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "selector": {"type": "string", "description": "CSS selector to wait for"},
                "timeout": {"type": "number", "description": "Timeout in seconds (default: 10)", "default": 10},
            },
            "required": ["selector"],
        },
    },
    {
        "name": "console_evaluate",
        "description": "Evaluate JavaScript in the browser page context. Use for custom interactions.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "expression": {"type": "string", "description": "JavaScript expression to evaluate"},
            },
            "required": ["expression"],
        },
    },
    {
        "name": "console_switch_region",
        "description": "Switch the Huawei Cloud console to a different region.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "region": {"type": "string", "description": "Region code (e.g. la-south-2, la-north-2, cn-north-4)"},
            },
            "required": ["region"],
        },
    },
    {
        "name": "console_list_elements",
        "description": "List elements matching a CSS selector with their attributes. Useful for finding buttons, links, inputs on the page.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "selector": {"type": "string", "description": "CSS selector (e.g. 'button', 'a', 'input')"},
                "max_results": {"type": "number", "description": "Max elements to return (default: 20)", "default": 20},
                "attributes": {"type": "array", "items": {"type": "string"}, "description": "Attributes to extract (default: ['id','class','href','text'])", "default": ["id", "class", "href", "text"]},
            },
            "required": ["selector"],
        },
    },
    {
        "name": "console_close",
        "description": "Close the browser session and clear cookies.",
        "inputSchema": {"type": "object", "properties": {}},
    },
]


async def handle_console_login(args: dict) -> dict:
    huawei_id = args["huawei_id"]
    password = args["password"]
    region = args.get("region", "la-south-2")

    result = await bm.login(huawei_id, password, region)

    if result.get("status") == "mfa_required":
        return {
            "content": [{"type": "text", "text": f"MFA required. Call console_submit_mfa with the 6-digit code.\n\nPage URL: {result.get('url', 'unknown')}\nRegion target: {region}"}],
        }
    elif result.get("status") == "logged_in":
        return {
            "content": [{"type": "text", "text": f"Login successful!\nURL: {result.get('url', 'unknown')}\nRegion: {region}\nCookies saved."}],
        }
    else:
        return {
            "content": [{"type": "text", "text": f"Login status: {result.get('status', 'unknown')}\nURL: {result.get('url', 'unknown')}\nError: {result.get('error', 'none')}"}],
            "isError": True,
        }


async def handle_console_submit_mfa(args: dict) -> dict:
    mfa_code = args["mfa_code"]
    result = await bm.submit_mfa(mfa_code)

    if result.get("status") == "logged_in":
        return {
            "content": [{"type": "text", "text": f"MFA accepted! Login complete.\nURL: {result.get('url', 'unknown')}\nRegion: {result.get('region', 'unknown')}"}],
        }
    else:
        return {
            "content": [{"type": "text", "text": f"MFA submission result: {result.get('status', 'unknown')}\nURL: {result.get('url', 'unknown')}\nError: {result.get('error', 'none')}"}],
            "isError": True,
        }


async def handle_console_navigate(args: dict) -> dict:
    url = args["url"]
    wait = args.get("wait_seconds", 3)
    page = await bm.get_page()
    if not page:
        return {"content": [{"type": "text", "text": "No browser session. Call console_login first."}], "isError": True}

    await page.goto(url, wait_until="networkidle", timeout=30000)
    await asyncio.sleep(wait)
    title = await page.title()
    current_url = page.url
    return {"content": [{"type": "text", "text": f"Navigated to: {current_url}\nTitle: {title}"}]}


async def handle_console_screenshot(args: dict) -> dict:
    page = await bm.get_page()
    if not page:
        return {"content": [{"type": "text", "text": "No browser session."}], "isError": True}

    full_page = args.get("full_page", False)
    selector = args.get("selector")

    if selector:
        element = page.locator(selector).first
        img_bytes = await element.screenshot()
    else:
        img_bytes = await page.screenshot(full_page=full_page)

    b64 = base64.b64encode(img_bytes).decode()
    return {
        "content": [
            {"type": "image", "data": b64, "mimeType": "image/png"},
        ],
    }


async def handle_console_get_page_info(args: dict) -> dict:
    page = await bm.get_page()
    if not page:
        return {"content": [{"type": "text", "text": "No browser session."}], "isError": True}

    max_len = args.get("max_text_length", 2000)
    url = page.url
    title = await page.title()
    try:
        text = await page.inner_text("body")
        if len(text) > max_len:
            text = text[:max_len] + f"\n... (truncated, total {len(text)} chars)"
    except:
        text = "(unable to get text)"

    return {"content": [{"type": "text", "text": f"URL: {url}\nTitle: {title}\n\nVisible text:\n{text}"}]}


async def handle_console_click(args: dict) -> dict:
    page = await bm.get_page()
    if not page:
        return {"content": [{"type": "text", "text": "No browser session."}], "isError": True}

    selector = args.get("selector")
    text = args.get("text")
    wait_after = args.get("wait_after", 2)

    if text:
        loc = page.get_by_text(text).first
    elif selector:
        loc = page.locator(selector).first
    else:
        return {"content": [{"type": "text", "text": "Provide selector or text."}], "isError": True}

    await loc.click()
    await asyncio.sleep(wait_after)
    return {"content": [{"type": "text", "text": f"Clicked. Current URL: {page.url}"}]}


async def handle_console_fill(args: dict) -> dict:
    page = await bm.get_page()
    if not page:
        return {"content": [{"type": "text", "text": "No browser session."}], "isError": True}

    selector = args["selector"]
    value = args["value"]
    press_enter = args.get("press_enter", False)

    loc = page.locator(selector).first
    await loc.click()
    await loc.fill(value)
    if press_enter:
        await page.keyboard.press("Enter")

    return {"content": [{"type": "text", "text": f"Filled '{selector}' with value (length {len(value)})."}]}


async def handle_console_wait_for(args: dict) -> dict:
    page = await bm.get_page()
    if not page:
        return {"content": [{"type": "text", "text": "No browser session."}], "isError": True}

    selector = args["selector"]
    timeout = args.get("timeout", 10) * 1000

    loc = page.locator(selector).first
    await loc.wait_for(state="visible", timeout=timeout)
    return {"content": [{"type": "text", "text": f"Element '{selector}' is visible."}]}


async def handle_console_evaluate(args: dict) -> dict:
    page = await bm.get_page()
    if not page:
        return {"content": [{"type": "text", "text": "No browser session."}], "isError": True}

    expression = args["expression"]
    result = await page.evaluate(expression)
    return {"content": [{"type": "text", "text": json.dumps(result, indent=2, default=str) if result is not None else "null"}]}


async def handle_console_switch_region(args: dict) -> dict:
    page = await bm.get_page()
    if not page:
        return {"content": [{"type": "text", "text": "No browser session."}], "isError": True}

    region = args["region"]
    url = f"https://console.huaweicloud.com/console/?region={region}#/home"
    await page.goto(url, wait_until="networkidle", timeout=30000)
    await asyncio.sleep(3)
    return {"content": [{"type": "text", "text": f"Switched to region {region}\nURL: {page.url}"}]}


async def handle_console_list_elements(args: dict) -> dict:
    page = await bm.get_page()
    if not page:
        return {"content": [{"type": "text", "text": "No browser session."}], "isError": True}

    selector = args["selector"]
    max_results = args.get("max_results", 20)
    attrs = args.get("attributes", ["id", "class", "href", "text"])

    elements = await page.locator(selector).all()
    results = []
    for i, el in enumerate(elements[:max_results]):
        info = {"index": i}
        for attr in attrs:
            if attr == "text":
                try:
                    info["text"] = (await el.inner_text())[:100]
                except:
                    info["text"] = ""
            elif attr == "visible":
                try:
                    info["visible"] = await el.is_visible()
                except:
                    info["visible"] = False
            else:
                try:
                    info[attr] = await el.get_attribute(attr) or ""
                except:
                    info[attr] = ""
        results.append(info)

    return {"content": [{"type": "text", "text": json.dumps(results, indent=2, ensure_ascii=False)}]}


async def handle_console_close(args: dict) -> dict:
    await bm.close()
    return {"content": [{"type": "text", "text": "Browser closed."}]}


TOOL_HANDLERS = {
    "console_login": handle_console_login,
    "console_submit_mfa": handle_console_submit_mfa,
    "console_navigate": handle_console_navigate,
    "console_screenshot": handle_console_screenshot,
    "console_get_page_info": handle_console_get_page_info,
    "console_click": handle_console_click,
    "console_fill": handle_console_fill,
    "console_wait_for": handle_console_wait_for,
    "console_evaluate": handle_console_evaluate,
    "console_switch_region": handle_console_switch_region,
    "console_list_elements": handle_console_list_elements,
    "console_close": handle_console_close,
}


def write_response(response: dict):
    msg = json.dumps(response)
    sys.stdout.write(msg + "\n")
    sys.stdout.flush()


async def handle_request(request: dict):
    method = request.get("method", "")
    req_id = request.get("id")
    params = request.get("params", {})

    if method == "initialize":
        write_response({
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "huawei-console-mcp", "version": "1.0.0"},
            },
        })
    elif method == "notifications/initialized":
        pass
    elif method == "tools/list":
        write_response({
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {"tools": TOOLS},
        })
    elif method == "tools/call":
        tool_name = params.get("name", "")
        tool_args = params.get("arguments", {})

        handler = TOOL_HANDLERS.get(tool_name)
        if not handler:
            write_response({
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {"code": -32601, "message": f"Unknown tool: {tool_name}"},
            })
            return

        try:
            result = await handler(tool_args)
            write_response({
                "jsonrpc": "2.0",
                "id": req_id,
                "result": result,
            })
        except Exception as e:
            tb = traceback.format_exc()
            write_response({
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [{"type": "text", "text": f"Error: {str(e)}\n\nTraceback:\n{tb}"}],
                    "isError": True,
                },
            })
    elif method == "ping":
        write_response({"jsonrpc": "2.0", "id": req_id, "result": {}})
    else:
        write_response({
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {"code": -32601, "message": f"Method not found: {method}"},
        })


async def main():
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await asyncio.get_event_loop().connect_read_pipe(lambda: protocol, sys.stdin)

    while True:
        try:
            line = await reader.readline()
            if not line:
                break

            line_str = line.decode("utf-8").strip()
            if not line_str:
                continue

            try:
                request = json.loads(line_str)
            except json.JSONDecodeError:
                continue

            await handle_request(request)
        except Exception as e:
            pass

    await bm.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        pass
