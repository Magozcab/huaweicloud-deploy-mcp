import asyncio
import json
import os
import sys
from playwright.async_api import async_playwright

HUAWEI_ID = os.environ.get("HUAWEI_ID", "")
PASSWORD = os.environ.get("HUAWEI_PASSWORD", "")
MFA_CODE = os.environ.get("MFA_CODE", "")
COOKIES_FILE = "/root/codearts/.secure/browser-cookies.json"
STATE_FILE = "/root/codearts/.secure/browser-state.json"
SCREENSHOTS_DIR = "/root/codearts/.secure/screenshots"

os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
os.makedirs(os.path.dirname(COOKIES_FILE), exist_ok=True)

async def screenshot(page, name):
    path = os.path.join(SCREENSHOTS_DIR, f"{name}.png")
    await page.screenshot(path=path, full_page=False)
    print(f"[SCREENSHOT] {path}")

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu",
                  "--disable-dev-shm-usage", "--window-size=1280,900"]
        )
        context = await browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()

        # === STEP 1: LOGIN ===
        print("[1] Navegando a Huawei Cloud login...")
        await page.goto("https://auth.huaweicloud.com/authui/login.html#/login", wait_until="networkidle", timeout=30000)
        await asyncio.sleep(5)
        await screenshot(page, "01_login_page")

        # Fill Huawei ID
        print("[2] Llenando Huawei ID...")
        id_input = page.locator('input[placeholder*="account"]').first
        await id_input.wait_for(state="visible", timeout=10000)
        await id_input.click()
        await asyncio.sleep(0.3)
        await id_input.fill(HUAWEI_ID)
        print(f"    Huawei ID ingresado")

        # Fill Password
        print("[3] Llenando Password...")
        pwd_input = page.locator('input[placeholder*="Password"]').first
        await pwd_input.wait_for(state="visible", timeout=10000)
        await pwd_input.click()
        await asyncio.sleep(0.3)
        await pwd_input.fill(PASSWORD)
        print("    Password ingresado")
        await screenshot(page, "02_credentials")

        # Click Login (press Enter)
        print("[4] Enviando login...")
        await page.keyboard.press("Enter")
        await asyncio.sleep(5)
        await screenshot(page, "03_after_login")

        current_url = page.url
        print(f"    URL: {current_url}")

        # === STEP 2: MFA ===
        is_mfa = "loginVerification" in current_url or "mfa" in current_url.lower()
        if not is_mfa:
            page_text = (await page.inner_text("body")).lower()
            is_mfa = "verification code" in page_text or "virtual mfa" in page_text

        if is_mfa:
            print("\n[5] MFA detectado!")
            await screenshot(page, "04_mfa_page")

            if not MFA_CODE:
                print("    MFA_CODE no proporcionado.")
                print("    Ejecuta de nuevo con: MFA_CODE=XXXXXX python3 huawei_login.py")
                # Save state for resume
                await context.storage_state(path=STATE_FILE)
                os.chmod(STATE_FILE, 0o600)
                await browser.close()
                return

            print(f"    Ingresando MFA code: {MFA_CODE[:2]}****")

            # Find MFA input
            mfa_input = None
            for sel in [
                'input[placeholder*="code"]',
                'input[placeholder*="Code"]',
                'input[placeholder*="Verification"]',
                'input[placeholder*="verification"]',
                'input[maxlength="6"]',
            ]:
                try:
                    loc = page.locator(sel).first
                    if await loc.is_visible(timeout=3000):
                        mfa_input = loc
                        print(f"    MFA input encontrado: {sel}")
                        break
                except:
                    continue

            if not mfa_input:
                # Try any visible text input
                inputs = await page.locator('input[type="text"]:visible').all()
                for inp in inputs:
                    mx = await inp.get_attribute("maxlength") or "999"
                    if int(mx) <= 8:
                        mfa_input = inp
                        print("    MFA input encontrado (alternativo)")
                        break

            if mfa_input:
                await mfa_input.click()
                await asyncio.sleep(0.3)
                await mfa_input.fill(MFA_CODE)
                print("    MFA code ingresado")
            else:
                print("    No se encontro input MFA, intentando keyboard...")
                await page.keyboard.type(MFA_CODE, delay=80)

            await asyncio.sleep(1)

            # Click OK/Verify button
            for sel in ['button:has-text("OK")', 'button:has-text("Verify")',
                        'button:has-text("Confirm")', 'button:has-text("Continue")',
                        'input[type="submit"]']:
                try:
                    loc = page.locator(sel).first
                    if await loc.is_visible(timeout=2000):
                        await loc.click()
                        print(f"    Boton clickeado: {sel}")
                        break
                except:
                    continue

            await asyncio.sleep(8)
            await screenshot(page, "05_after_mfa")

        # === STEP 3: VERIFY LOGIN ===
        current_url = page.url
        print(f"\n[6] URL post-login: {current_url}")

        # Check for captcha/slider
        page_text = (await page.inner_text("body")).lower()
        if "slider" in page_text or "captcha" in page_text or "slide" in page_text:
            print("    Captcha/Slider detectado, intentando resolver...")
            await screenshot(page, "05b_captcha")
            slider = page.locator('[class*="slider"] [class*="btn"], [class*="slide-btn"], [class*="drag"]').first
            try:
                if await slider.is_visible(timeout=3000):
                    box = await slider.bounding_box()
                    if box:
                        await page.mouse.move(box["x"] + 5, box["y"] + box["height"]/2)
                        await page.mouse.down()
                        target_x = box["x"] + 280
                        for i in range(25):
                            x = box["x"] + 5 + (target_x - box["x"]) * (i/25)
                            y = box["y"] + box["height"]/2 + (2 * ((i*7) % 3 - 1))
                            await page.mouse.move(x, y)
                            await asyncio.sleep(0.025)
                        await page.mouse.up()
                        print("    Slider arrastrado")
                        await asyncio.sleep(5)
            except Exception as e:
                print(f"    Error slider: {e}")

        await asyncio.sleep(5)
        current_url = page.url
        await screenshot(page, "06_final")

        login_ok = "console" in current_url or ("myhuaweicloud.com" in current_url and "auth" not in current_url)

        if login_ok:
            print("\n=== LOGIN EXITOSO ===")

            cookies = await context.cookies()
            with open(COOKIES_FILE, "w") as f:
                json.dump(cookies, f, indent=2)
            os.chmod(COOKIES_FILE, 0o600)
            print(f"    Cookies: {COOKIES_FILE}")

            await context.storage_state(path=STATE_FILE)
            os.chmod(STATE_FILE, 0o600)
            print(f"    State: {STATE_FILE}")

            # Navigate to la-south-2
            print("\n[7] Navegando a la-south-2...")
            await page.goto("https://console.huaweicloud.com/console/?region=la-south-2#/home", wait_until="networkidle", timeout=30000)
            await asyncio.sleep(3)
            await screenshot(page, "07_la_south_2")
            print(f"    URL: {page.url}")

            # CodeArts
            print("\n[8] Navegando a CodeArts la-south-2...")
            await page.goto("https://console.huaweicloud.com/devcloud/?region=la-south-2#/overview", wait_until="networkidle", timeout=30000)
            await asyncio.sleep(3)
            await screenshot(page, "08_codearts")
            print(f"    URL: {page.url}")

            title = await page.title()
            print(f"    Titulo: {title}")

            print("\n=== LISTO PARA REPLICAR PROYECTO EN la-south-2 ===")
        else:
            print(f"\n=== LOGIN NO COMPLETADO ===")
            print(f"    URL: {current_url}")
            try:
                text = await page.inner_text("body")
                print(f"    Texto: {text[:500]}")
            except:
                pass

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
