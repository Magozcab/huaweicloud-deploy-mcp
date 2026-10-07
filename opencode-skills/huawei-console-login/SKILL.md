# Skill: Huawei Console Login

Authenticates to Huawei Cloud Console via Playwright browser, solving MFA and slider captcha automatically.

## When to use
- Any task requiring Huawei Cloud Console UI access (CodeArts pipeline editor, repo settings, branch protection, etc.)
- The `hcloud` CLI API has limitations (e.g., `UpdatePipelineInfo` with complex definition fails)
- Credentials are stored in `.secure/console-credentials.env`

## Prerequisites
- Playwright browser available
- Python packages: `pillow`, `pytesseract`, `opencv-python-headless`, `numpy`
- System: `tesseract-ocr`
- Credentials file: `<project_root>/.secure/console-credentials.env`

## Workflow

### Step 1: Load credentials
```bash
source <project_root>/.secure/console-credentials.env
```
Variables: CONSOLE_DOMAIN, CONSOLE_USER, CONSOLE_PASSWORD, CONSOLE_REGION, CODEARTS_BASE_URL

### Step 2: Navigate to login page
```
playwright_browser_navigate -> https://auth.huaweicloud.com/authui/login.html#/login
```

### Step 3: Fill login form
Fill: Tenant name = CONSOLE_DOMAIN, IAM username = CONSOLE_USER, Password = CONSOLE_PASSWORD
Click: Log In

### Step 4: Handle MFA verification
After login, a verification page appears. Options:
- Mobile phone (SMS)
- Email (code to email)

**Prefer email** (select Email radio).

### Step 5: Solve slider captcha
Before sending the MFA code, a slider captcha appears. Use the **captcha solver script**:

```bash
python3 <skill_dir>/solve_slider_captcha.py
```

This script:
1. Takes a screenshot of the captcha area
2. Uses OpenCV to detect the puzzle piece position
3. Calculates the drag distance
4. Performs the drag with human-like movement (random jitter, variable speed)
5. Retries up to 5 times if verification fails
6. Returns SUCCESS or FAILURE

### Step 6: Send and enter MFA code
After captcha is solved, click "Send Code".
Ask the user for the 6-digit code.
Enter the code and click OK.

### Step 7: Save session cookies
After successful login, save cookies for reuse:
```javascript
const cookies = await page.context().cookies();
// Save to .secure/browser-cookies.json
```

## Captcha Solver Algorithm

The slider captcha shows a background image with a gap and a puzzle piece that needs to be dragged to fill the gap.

### Detection method (OpenCV):
1. Screenshot the captcha area
2. Extract the background image and the slider piece image
3. Apply Canny edge detection to both
4. Use template matching (`cv2.matchTemplate`) to find the piece position in the background
5. Calculate the pixel offset from the current slider position to the target
6. Convert pixel offset to drag distance (accounting for viewport scaling)

### Drag simulation:
- Start at slider button center
- Move in small increments (5-15px) with random jitter
- Add slight pauses (20-50ms) between moves
- Total drag time: 1-3 seconds (human-like)

## Files
- `solve_slider_captcha.py` — Main captcha solver script
- `SKILL.md` — This file

## Known issues
- Captcha may require multiple attempts (refresh + retry)
- If tesseract OCR is needed for text captcha, ensure `tesseract-ocr` is installed
- Session cookies expire after ~30 minutes of inactivity
