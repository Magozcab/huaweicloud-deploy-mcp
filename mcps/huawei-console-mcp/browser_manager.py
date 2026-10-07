import asyncio
import json
import os
from typing import Optional, Dict, Any
from playwright.async_api import async_playwright, Page, Browser, BrowserContext

COOKIES_FILE = os.environ.get(
    "COOKIES_FILE", "/root/codearts/.secure/browser-cookies.json"
)
STATE_FILE = os.environ.get(
    "STATE_FILE", "/root/codearts/.secure/browser-state.json"
)
SCREENSHOTS_DIR = os.environ.get(
    "SCREENSHOTS_DIR", "/root/codearts/.secure/screenshots"
)


class BrowserManager:
    def __init__(self):
        self._playwright = None
        self._browser: Optional[Browser] = None
        self._context: Optional[BrowserContext] = None
        self._page: Optional[Page] = None
        self._logged_in = False
        self._region = ""

    async def _ensure_browser(self):
        if self._browser and self._browser.is_connected():
            return

        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-gpu",
                "--disable-dev-shm-usage",
                "--window-size=1280,900",
            ],
        )
        self._context = await self._browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        self._page = await self._context.new_page()

    async def get_page(self) -> Optional[Page]:
        if not self._page:
            return None
        try:
            _ = self._page.url
            return self._page
        except:
            return None

    async def login(self, huawei_id: str, password: str, region: str = "la-south-2") -> Dict[str, Any]:
        await self._ensure_browser()
        page = self._page

        try:
            await page.goto(
                "https://auth.huaweicloud.com/authui/login.html#/login",
                wait_until="networkidle",
                timeout=30000,
            )
        except Exception as e:
            if "timeout" not in str(e).lower():
                return {"status": "error", "error": f"Navigation failed: {e}"}

        await asyncio.sleep(5)

        try:
            await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "login_page.png"))
        except:
            pass

        id_filled = False
        for sel in [
            'input[placeholder*="account" i]',
            'input[placeholder*="email" i]',
            'input[placeholder*="phone" i]',
            'input[placeholder*="Huawei" i]',
            "#IAMAccountInputId",
        ]:
            try:
                loc = page.locator(sel).first
                if await loc.is_visible(timeout=3000):
                    await loc.click()
                    await asyncio.sleep(0.3)
                    await loc.fill(huawei_id)
                    id_filled = True
                    break
            except:
                continue

        if not id_filled:
            try:
                form = page.locator("#hwLoginDivId, .hwidsdk_mudule, .main-login").first
                if await form.is_visible(timeout=3000):
                    await form.click()
                    await asyncio.sleep(0.5)
                    await page.keyboard.type(huawei_id, delay=50)
                    id_filled = True
            except:
                pass

        if not id_filled:
            return {"status": "error", "error": "Could not find Huawei ID input field"}

        await asyncio.sleep(1)

        pwd_filled = False
        for sel in [
            'input[placeholder*="Password" i]',
            'input[placeholder*="password" i]',
            'input[type="password"]:visible',
            "#IAMPasswordInputId",
        ]:
            try:
                loc = page.locator(sel).first
                if await loc.is_visible(timeout=3000):
                    await loc.click()
                    await asyncio.sleep(0.3)
                    await loc.fill(password)
                    pwd_filled = True
                    break
            except:
                continue

        if not pwd_filled:
            await page.keyboard.press("Tab")
            await asyncio.sleep(0.3)
            await page.keyboard.type(password, delay=50)
            pwd_filled = True

        await asyncio.sleep(1)

        try:
            await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "credentials_filled.png"))
        except:
            pass

        login_clicked = False
        for sel in [
            'button:has-text("Log In")',
            'button:has-text("Login")',
            'button:has-text("Sign In")',
            "#btn_login",
            ".loginBtn",
            'input[type="submit"]',
        ]:
            try:
                loc = page.locator(sel).first
                if await loc.is_visible(timeout=2000):
                    await loc.click()
                    login_clicked = True
                    break
            except:
                continue

        if not login_clicked:
            await page.keyboard.press("Enter")
            login_clicked = True

        await asyncio.sleep(5)

        try:
            await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "after_login.png"))
        except:
            pass

        current_url = page.url

        is_mfa = (
            "loginVerification" in current_url
            or "mfa" in current_url.lower()
            or "verify" in current_url.lower()
        )

        if not is_mfa:
            try:
                text = (await page.inner_text("body")).lower()
                is_mfa = (
                    "verification code" in text
                    or "virtual mfa" in text
                    or "authenticator" in text
                )
            except:
                pass

        if is_mfa:
            self._region = region
            return {"status": "mfa_required", "url": current_url}

        return await self._check_login_success(region)

    async def submit_mfa(self, mfa_code: str) -> Dict[str, Any]:
        page = self._page
        if not page:
            return {"status": "error", "error": "No browser session"}

        mfa_filled = False
        for sel in [
            'input[placeholder*="code" i]',
            'input[placeholder*="Code" i]',
            'input[placeholder*="verification" i]',
            'input[placeholder*="Verification" i]',
            'input[maxlength="6"]',
        ]:
            try:
                loc = page.locator(sel).first
                if await loc.is_visible(timeout=3000):
                    await loc.click()
                    await asyncio.sleep(0.3)
                    await loc.fill(mfa_code)
                    mfa_filled = True
                    break
            except:
                continue

        if not mfa_filled:
            try:
                inputs = await page.locator('input[type="text"]:visible').all()
                for inp in inputs:
                    mx = await inp.get_attribute("maxlength") or "999"
                    if int(mx) <= 8:
                        await inp.click()
                        await inp.fill(mfa_code)
                        mfa_filled = True
                        break
            except:
                pass

        if not mfa_filled:
            await page.keyboard.type(mfa_code, delay=80)

        await asyncio.sleep(1)

        btn_clicked = False
        for sel in [
            'button:has-text("OK")',
            'button:has-text("Verify")',
            'button:has-text("Confirm")',
            'button:has-text("Continue")',
            'button:has-text("Submit")',
            'input[type="submit"]',
        ]:
            try:
                loc = page.locator(sel).first
                if await loc.is_visible(timeout=2000):
                    await loc.click()
                    btn_clicked = True
                    break
            except:
                continue

        if not btn_clicked:
            await page.keyboard.press("Enter")

        await asyncio.sleep(8)

        try:
            await page.screenshot(path=os.path.join(SCREENSHOTS_DIR, "after_mfa.png"))
        except:
            pass

        current_url = page.url

        still_mfa = (
            "loginVerification" in current_url
            or "mfa" in current_url.lower()
        )
        if not still_mfa:
            try:
                text = (await page.inner_text("body")).lower()
                still_mfa = "verification code" in text or "virtual mfa" in text
            except:
                pass

        if still_mfa:
            return {
                "status": "mfa_failed",
                "url": current_url,
                "error": "MFA code may be expired or incorrect. Page still shows MFA.",
            }

        return await self._check_login_success(self._region or "la-south-2")

    async def _check_login_success(self, region: str) -> Dict[str, Any]:
        page = self._page
        current_url = page.url

        login_ok = (
            "console" in current_url
            or ("myhuaweicloud.com" in current_url and "auth" not in current_url)
        )

        if not login_ok:
            await asyncio.sleep(5)
            current_url = page.url
            login_ok = (
                "console" in current_url
                or ("myhuaweicloud.com" in current_url and "auth" not in current_url)
            )

        if login_ok:
            self._logged_in = True
            self._region = region

            try:
                cookies = await self._context.cookies()
                with open(COOKIES_FILE, "w") as f:
                    json.dump(cookies, f, indent=2)
                os.chmod(COOKIES_FILE, 0o600)
            except:
                pass

            try:
                await self._context.storage_state(path=STATE_FILE)
                os.chmod(STATE_FILE, 0o600)
            except:
                pass

            try:
                url = f"https://console.huaweicloud.com/console/?region={region}#/home"
                await page.goto(url, wait_until="networkidle", timeout=30000)
                await asyncio.sleep(3)
                await page.screenshot(
                    path=os.path.join(SCREENSHOTS_DIR, f"region_{region}.png")
                )
            except:
                pass

            return {"status": "logged_in", "url": page.url, "region": region}
        else:
            return {
                "status": "login_failed",
                "url": current_url,
                "error": "Login did not complete. Check screenshots.",
            }

    async def close(self):
        try:
            if self._browser:
                await self._browser.close()
            if self._playwright:
                await self._playwright.stop()
        except:
            pass
        self._browser = None
        self._context = None
        self._page = None
        self._logged_in = False
