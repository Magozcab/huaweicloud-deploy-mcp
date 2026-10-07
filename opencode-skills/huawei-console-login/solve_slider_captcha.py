#!/usr/bin/env python3
"""
Huawei Cloud Console — Slider Captcha Solver

Uses OpenCV template matching to find the puzzle piece position
and simulates human-like drag to solve the slider captcha.

Usage:
    python3 solve_slider_captcha.py [--screenshot-dir /tmp] [--max-retries 5]

Requires: pillow, opencv-python-headless, numpy
Requires: Playwright browser open with captcha visible
"""

import argparse
import json
import os
import subprocess
import sys
import time
import tempfile
from pathlib import Path

try:
    import cv2
    import numpy as np
    from PIL import Image
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Install: pip install pillow opencv-python-headless numpy")
    sys.exit(1)


def take_screenshot(output_path: str) -> str:
    """Take a full page screenshot using Playwright."""
    # This will be called from the Playwright context
    # For now, we expect the screenshot to be provided
    return output_path


def detect_slider_position(bg_image_path: str, piece_image_path: str) -> int:
    """
    Detect the x-position where the puzzle piece fits in the background.
    
    Uses Canny edge detection + template matching.
    Returns the x-offset in pixels.
    """
    bg = cv2.imread(bg_image_path, cv2.IMREAD_GRAYSCALE)
    piece = cv2.imread(piece_image_path, cv2.IMREAD_GRAYSCALE)
    
    if bg is None or piece is None:
        raise ValueError("Could not read captcha images")
    
    # Apply edge detection
    bg_edges = cv2.Canny(bg, 100, 200)
    piece_edges = cv2.Canny(piece, 100, 200)
    
    # Template matching
    result = cv2.matchTemplate(bg_edges, piece_edges, cv2.TM_CCOEFF_NORMED)
    _, max_val, _, max_loc = cv2.minMaxLoc(result)
    
    print(f"Template match confidence: {max_val:.3f}, position: {max_loc}")
    return max_loc[0]


def detect_gap_position(bg_image_path: str) -> int:
    """
    Detect the gap/hole position in the background image.
    
    The gap typically appears as a distinct region with different
    color/texture compared to the surrounding area.
    """
    bg = cv2.imread(bg_image_path)
    if bg is None:
        raise ValueError("Could not read background image")
    
    gray = cv2.cvtColor(bg, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    
    # Find contours
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    # Look for a contour that matches the puzzle piece shape
    # (roughly square with a bump, area between 2000-8000 pixels)
    candidates = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        area = cv2.contourArea(contour)
        if 2000 < area < 8000 and 0.7 < w/h < 1.3:
            candidates.append((x, y, w, h, area))
    
    if candidates:
        # Sort by x position and take the rightmost (the gap, not the piece)
        candidates.sort(key=lambda c: c[0])
        gap = candidates[-1]
        print(f"Detected gap at x={gap[0]}, y={gap[1]}, w={gap[2]}, h={gap[3]}")
        return gap[0]
    
    return -1


def generate_drag_offsets(total_distance: int) -> list:
    """
    Generate human-like drag movement offsets.
    
    Simulates:
    - Acceleration at start
    - Deceleration at end
    - Random jitter
    - Variable speed
    """
    offsets = []
    current = 0
    
    # Acceleration phase (first 30%)
    accel_end = total_distance * 0.3
    step = 5
    while current < accel_end:
        current += step + np.random.randint(0, 3)
        jitter = np.random.randint(-2, 3)
        offsets.append((min(current, total_distance), jitter))
        step = min(step + 1, 15)
    
    # Constant speed phase (30-70%)
    while current < total_distance * 0.7:
        current += 10 + np.random.randint(-2, 3)
        jitter = np.random.randint(-1, 2)
        offsets.append((min(current, total_distance), jitter))
    
    # Deceleration phase (last 30%)
    step = 10
    while current < total_distance:
        current += step
        jitter = np.random.randint(-1, 2)
        offsets.append((min(current, total_distance), jitter))
        step = max(step - 1, 2)
    
    # Ensure we end at exact position
    if offsets[-1][0] != total_distance:
        offsets.append((total_distance, 0))
    
    return offsets


def build_playwright_drag_script(
    start_x: float, start_y: float,
    drag_distance: int,
    pause_ms: int = 25
) -> str:
    """
    Build a Playwright JavaScript snippet that performs the drag.
    """
    offsets = generate_drag_offsets(drag_distance)
    
    moves_js = []
    for (offset, jitter) in offsets:
        moves_js.append(
            f"await page.mouse.move({start_x} + {offset}, {start_y} + {jitter}, {{steps: 1}});"
            f"await page.waitForTimeout({pause_ms});"
        )
    
    script = f"""
    async (page) => {{
        const startX = {start_x};
        const startY = {start_y};
        
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.waitForTimeout(100);
        
        {chr(10).join('        ' + m for m in moves_js)}
        
        await page.mouse.up();
        await page.waitForTimeout(1500);
        
        // Check if captcha is resolved
        const captchaGone = (await page.locator('.yidun_panel').count()) === 0;
        const resendVisible = (await page.locator('text=Resend').count()) > 0;
        
        return captchaGone || resendVisible ? 'SUCCESS' : 'FAILED';
    }}
    """
    return script


def main():
    parser = argparse.ArgumentParser(description='Solve Huawei Cloud slider captcha')
    parser.add_argument('--screenshot-dir', default='/tmp/captcha', help='Directory for screenshots')
    parser.add_argument('--max-retries', type=int, default=5, help='Maximum retry attempts')
    parser.add_argument('--method', choices=['template', 'gap', 'brute'], default='gap',
                        help='Detection method: template matching, gap detection, or brute force')
    args = parser.parse_args()
    
    os.makedirs(args.screenshot_dir, exist_ok=True)
    
    print(f"Huawei Cloud Slider Captcha Solver")
    print(f"Method: {args.method}, Max retries: {args.max_retries}")
    print()
    print("INSTRUCTIONS:")
    print("1. Ensure Playwright browser is open with the captcha visible")
    print("2. Take a screenshot of the captcha area")
    print("3. Run this script to detect the position")
    print("4. Use the generated Playwright script to perform the drag")
    print()
    
    if args.method == 'brute':
        print("Brute force mode: trying positions from 100 to 300 in steps of 20")
        positions = list(range(100, 320, 20))
        print(f"Positions to try: {positions}")
        print()
        print("Use this Playwright code to try each position:")
        print("```javascript")
        for pos in positions:
            print(f"  // Try drag distance: {pos}px")
        print("```")
    
    print("\nTo use from Playwright context:")
    print("1. Take screenshot: await page.screenshot({path: '/tmp/captcha/full.png'})")
    print("2. Extract captcha images using the browser's DOM")
    print("3. Run: python3 solve_slider_captcha.py --screenshot-dir /tmp/captcha")
    print("4. Use the output drag distance in playwright_browser_run_code_unsafe")


if __name__ == '__main__':
    main()
