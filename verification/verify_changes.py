
from playwright.sync_api import sync_playwright
import time

def verify_frontend():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1000})

        try:
            # Navigate to the landing page
            print("Navigating to Landing Page...")
            page.goto("http://localhost:3000/")

            # Wait for content to render
            page.wait_for_timeout(3000)

            # Take screenshot of Landing Page
            print("Taking Landing Page screenshot...")
            page.screenshot(path="verification/landing_page_verified.png")

            # Navigate to Demo Video Page
            print("Navigating to Demo Video Page...")
            page.goto("http://localhost:3000/demo-video")
            page.wait_for_timeout(3000)

            # Take screenshot of Demo Video Page
            print("Taking Demo Video Page screenshot...")
            page.screenshot(path="verification/demo_video_verified.png")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_frontend()
