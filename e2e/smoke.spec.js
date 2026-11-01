// @ts-check
const { test, expect } = require('@playwright/test');

test('loads reader and starts ayah audio', async ({ page }) => {
  await page.goto('/');

  await page.waitForFunction(() => {
    const splash = document.getElementById('appStartupSplash');
    return !document.body.classList.contains('app-is-booting') || splash?.classList.contains('app-splash--hide');
  }, { timeout: 60_000 });

  await page.waitForFunction(() => {
    const sel = document.getElementById('surahSelect');
    return sel && sel.options.length > 1 && sel.value && sel.value !== '';
  }, { timeout: 60_000 });

  const playBtn = page.locator('.verse-play-btn').first();
  await expect(playBtn).toBeVisible({ timeout: 60_000 });
  await playBtn.click();

  await expect(page.locator('#quranAudio')).toHaveAttribute('src', /cdn\.islamic\.network|alquran\.cloud/i, {
    timeout: 20_000,
  });

  await expect(page.locator('#audioPlayerBar')).not.toHaveClass(/player-hidden/);
});
