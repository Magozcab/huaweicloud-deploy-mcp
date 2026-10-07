import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-setuid-sandbox"])
        context = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await context.new_page()

        print("[1] Navegando a login...")
        await page.goto("https://auth.huaweicloud.com/authui/login.html#/login", wait_until="networkidle", timeout=30000)
        await asyncio.sleep(3)

        content = await page.content()
        with open("/tmp/huawei_login_page.html", "w") as f:
            f.write(content)
        print("[HTML] Guardado en /tmp/huawei_login_page.html")

        await page.screenshot(path="/root/codearts/.secure/screenshots/login_debug.png", full_page=True)

        print("\n=== INPUTS ENCONTRADOS ===")
        inputs = await page.locator("input").all()
        for i, inp in enumerate(inputs):
            tag = await inp.evaluate("el => el.outerHTML.substring(0, 200)")
            vis = await inp.is_visible()
            iid = await inp.get_attribute("id") or ""
            iname = await inp.get_attribute("name") or ""
            itype = await inp.get_attribute("type") or ""
            iclass = await inp.get_attribute("class") or ""
            iplaceholder = await inp.get_attribute("placeholder") or ""
            print(f"  [{i}] id={iid} name={iname} type={itype} visible={vis} class={iclass[:60]} placeholder={iplaceholder}")

        print("\n=== BUTTONS ENCONTRADOS ===")
        buttons = await page.locator("button, a[role='button'], input[type='submit']").all()
        for i, btn in enumerate(buttons):
            vis = await btn.is_visible()
            txt = await btn.inner_text() if vis else ""
            bid = await btn.get_attribute("id") or ""
            bclass = await btn.get_attribute("class") or ""
            print(f"  [{i}] id={bid} visible={vis} text={txt[:40]} class={bclass[:60]}")

        print("\n=== IFRAMES ===")
        frames = page.frames
        for i, frame in enumerate(frames):
            print(f"  [{i}] url={frame.url[:80]}")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
