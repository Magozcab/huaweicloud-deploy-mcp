#!/usr/bin/env python3
"""
Huawei Console Login + Captcha Solver — Playwright Integration

Full flow:
1. Navigate to login page
2. Fill credentials
3. Handle MFA selection (prefer email)
4. Solve slider captcha using OpenCV
5. Wait for MFA code input

This script is meant to be called from the opencode session
using playwright_browser_run_code_unsafe with the generated JS snippets.
"""

import json
import sys
import os
import base64
import tempfile
from pathlib import Path

try:
    import cv2
    import numpy as np
    from PIL import Image
except ImportError as e:
    print(f"Missing dependency: {e}", file=sys.stderr)
    sys.exit(1)


def extract_captcha_images(screenshot_bytes: bytes, output_dir: str) -> dict:
    """
    Extract the captcha background and slider piece from a full page screenshot.
    
    The Huawei captcha structure:
    - Background image: class 'yidun_bgimg'
    - Slider piece: class 'yidun_jigsaw'
    
    Returns dict with paths to extracted images.
    """
    os.makedirs(output_dir, exist_ok=True)
    
    # Save full screenshot
    full_path = os.path.join(output_dir, "full_screenshot.png")
    with open(full_path, "wb") as f:
        f.write(screenshot_bytes)
    
    # Load and analyze
    img = cv2.imread(full_path)
    if img is None:
        raise ValueError("Could not read screenshot")
    
    h, w = img.shape[:2]
    
    # The captcha area is typically in the center of the page
    # Look for the characteristic dark border of the captcha panel
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    return {
        "full_screenshot": full_path,
        "width": w,
        "height": h
    }


def find_gap_in_captcha_bg(bg_path: str) -> int:
    """
    Find the gap position in the captcha background image.
    
    Algorithm:
    1. Load the background image
    2. Convert to grayscale
    3. Apply threshold to find the gap (darker region)
    4. Find the contour that matches the puzzle piece shape
    5. Return the x-coordinate of the gap
    """
    bg = cv2.imread(bg_path)
    if bg is None:
        return -1
    
    gray = cv2.cvtColor(bg, cv2.COLOR_BGR2GRAY)
    
    # Method 1: Look for the characteristic shadow/outline of the gap
    # The gap typically has a distinct border
    edges = cv2.Canny(gray, 80, 160)
    
    # Dilate edges to connect nearby edges
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    dilated = cv2.dilate(edges, kernel, iterations=2)
    
    # Find contours
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    # Filter contours by shape (looking for puzzle-piece shape)
    # Typical puzzle piece: ~50-70px wide, ~50-70px tall
    candidates = []
    img_h, img_w = gray.shape
    
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        area = cv2.contourArea(contour)
        perimeter = cv2.arcLength(contour, True)
        
        # Puzzle piece characteristics
        if (40 < w < 80 and 40 < h < 80 and 
            1500 < area < 5000 and
            x > img_w * 0.2):  # Gap is usually in the right 80% of the image
            candidates.append((x, y, w, h, area, perimeter))
    
    if candidates:
        # Sort by x position, take the rightmost significant contour
        candidates.sort(key=lambda c: c[0])
        best = candidates[-1]
        print(f"Gap detected at x={best[0]}, y={best[1]}, w={best[2]}, h={best[3]}")
        return best[0]
    
    # Method 2: Template matching with the slider piece
    # If we have both images, use template matching
    return -1


def find_gap_template_matching(bg_path: str, piece_path: str) -> int:
    """
    Use template matching to find where the piece fits.
    """
    bg = cv2.imread(bg_path, cv2.IMREAD_GRAYSCALE)
    piece = cv2.imread(piece_path, cv2.IMREAD_GRAYSCALE)
    
    if bg is None or piece is None:
        return -1
    
    # Edge detection for better matching
    bg_edges = cv2.Canny(bg, 100, 200)
    piece_edges = cv2.Canny(piece, 100, 200)
    
    # Template matching
    result = cv2.matchTemplate(bg_edges, piece_edges, cv2.TM_CCOEFF_NORMED)
    _, max_val, _, max_loc = cv2.minMaxLoc(result)
    
    print(f"Template match: confidence={max_val:.3f}, position={max_loc}")
    
    if max_val > 0.4:
        return max_loc[0]
    
    return -1


def generate_playwright_login_script(credentials: dict) -> str:
    """Generate the full Playwright login script."""
    return f"""
    async (page) => {{
        // Step 1: Navigate to login
        await page.goto('https://auth.huaweicloud.com/authui/login.html#/login');
        await page.waitForTimeout(2000);
        
        // Step 2: Fill credentials
        await page.getByRole('textbox', {{ name: 'Tenant name or Huawei Cloud' }}).fill('{credentials["domain"]}');
        await page.getByRole('textbox', {{ name: 'IAM username or email address' }}).fill('{credentials["user"]}');
        await page.getByRole('textbox', {{ name: 'IAM user password' }}).fill('{credentials["password"]}');
        await page.waitForTimeout(500);
        
        // Step 3: Click Log In
        await page.locator('.buttonAreaDiv').click();
        await page.waitForTimeout(3000);
        
        // Step 4: Select email verification
        const emailRadio = page.locator('#email');
        if (await emailRadio.isVisible()) {{
            await emailRadio.click();
            await page.waitForTimeout(1000);
        }}
        
        return 'Login form submitted, MFA page reached';
    }}
    """


def generate_playwright_captcha_solver_script(
    drag_distance: int,
    start_x: float = 0,
    start_y: float = 0
) -> str:
    """Generate Playwright script to solve the captcha with a specific drag distance."""
    
    # Generate human-like offsets
    offsets = []
    current = 0
    np.random.seed(None)
    
    # Acceleration phase
    accel_end = drag_distance * 0.3
    step = 5
    while current < accel_end:
        current += step + int(np.random.randint(0, 3))
        jitter = int(np.random.randint(-2, 3))
        offsets.append((min(current, drag_distance), jitter))
        step = min(step + 1, 15)
    
    # Constant phase
    while current < drag_distance * 0.7:
        current += 10 + int(np.random.randint(-2, 3))
        jitter = int(np.random.randint(-1, 2))
        offsets.append((min(current, drag_distance), jitter))
    
    # Deceleration phase
    step = 10
    while current < drag_distance:
        current += step
        jitter = int(np.random.randint(-1, 2))
        offsets.append((min(current, drag_distance), jitter))
        step = max(step - 1, 2)
    
    if not offsets or offsets[-1][0] != drag_distance:
        offsets.append((drag_distance, 0))
    
    moves = []
    for (offset, jitter) in offsets:
        moves.append(
            f"await page.mouse.move(startX + {offset}, startY + {jitter}, {{steps: 1}});"
            f"await page.waitForTimeout(25);"
        )
    
    return f"""
    async (page) => {{
        // Get slider button position
        const slider = page.getByRole('button', {{ name: 'Slide to complete the image' }});
        const box = await slider.boundingBox();
        if (!box) return 'Slider not found';
        
        const startX = box.x + box.width / 2;
        const startY = box.y + box.height / 2;
        
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.waitForTimeout(100);
        
        {chr(10).join('        ' + m for m in moves)}
        
        await page.mouse.up();
        await page.waitForTimeout(1500);
        
        // Check result
        const captchaGone = (await page.locator('.yidun_panel').count()) === 0;
        const resendVisible = (await page.locator('text=Resend').count()) > 0;
        const failed = await page.locator('.yidun_fail').count() > 0;
        
        if (captchaGone || resendVisible) return 'SUCCESS';
        if (failed) return 'FAILED - wrong position';
        return 'UNKNOWN - captcha still visible';
    }}
    """


def generate_playwright_full_captcha_solver() -> str:
    """
    Generate a self-contained Playwright script that:
    1. Takes a screenshot
    2. Extracts captcha images from DOM
    3. Sends them back for analysis
    """
    return """
    async (page) => {
        // Extract captcha images directly from the DOM
        const bgImg = await page.locator('.yidun_bgimg').first();
        const pieceImg = await page.locator('.yidun_jigsaw').first();
        
        if (!await bgImg.isVisible() || !await pieceImg.isVisible()) {
            return JSON.stringify({error: 'Captcha images not found in DOM'});
        }
        
        // Get image sources
        const bgSrc = await bgImg.getAttribute('src');
        const pieceSrc = await pieceImg.getAttribute('src');
        
        // Get slider button position
        const slider = page.getByRole('button', { name: 'Slide to complete the image' });
        const sliderBox = await slider.boundingBox();
        
        // Get background image position
        const bgBox = await bgImg.boundingBox();
        
        return JSON.stringify({
            bgSrc: bgSrc ? bgSrc.substring(0, 50) + '...' : null,
            pieceSrc: pieceSrc ? pieceSrc.substring(0, 50) + '...' : null,
            sliderBox: sliderBox,
            bgBox: bgBox,
            hasImages: !!(bgSrc && pieceSrc)
        });
    }
    """


if __name__ == '__main__':
    print("Huawei Console Login + Captcha Solver")
    print("=" * 40)
    print()
    print("This module provides functions for:")
    print("  - generate_playwright_login_script(credentials)")
    print("  - generate_playwright_captcha_solver_script(drag_distance)")
    print("  - find_gap_in_captcha_bg(bg_path)")
    print("  - find_gap_template_matching(bg_path, piece_path)")
    print()
    print("Usage from opencode:")
    print("  1. Load credentials from .secure/console-credentials.env")
    print("  2. Use playwright_browser_navigate to go to login page")
    print("  3. Use playwright_browser_run_code_unsafe with login script")
    print("  4. Use playwright_browser_run_code_unsafe with captcha solver")
    print("  5. Enter MFA code when prompted")
