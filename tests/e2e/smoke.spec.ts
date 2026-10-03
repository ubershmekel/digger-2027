// Boots the built game in each browser engine and plays through the main flows:
// title, start, movement, graphics/sound toggles, pause, settings, quit.
import { expect, test } from '@playwright/test';

test('boots, plays, toggles modes, pauses and quits without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() == 'error') errors.push(m.text());
  });

  await page.goto('./');
  await expect(page).toHaveTitle('Digger 2027');
  await page.getByRole('button', { name: 'Press any key to begin' }).click();
  await page.getByRole('button', { name: '1 Player' }).click();

  // The level intro, then play: hold right for a moment and fire.
  await page.waitForTimeout(2500);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(800);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);

  // Switch to classic graphics and sound, and back.
  // F2 flips the graphics mode (auto-quality may already have chosen classic on slow engines).
  const classic = page.locator('canvas.classic-canvas');
  const wasClassic = await classic.isVisible();
  await page.keyboard.press('F2');
  if (wasClassic) await expect(classic).toBeHidden();
  else await expect(classic).toBeVisible();
  await page.keyboard.press('F4');
  await page.waitForTimeout(300);
  await page.keyboard.press('F2');
  await page.keyboard.press('F4');
  await page.waitForTimeout(500);

  // Pause, look at settings, quit to the title.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Quit to Title' }).click();
  await expect(page.getByRole('button', { name: '1 Player' })).toBeVisible({ timeout: 10_000 });

  // WebGL may be unavailable in some headless engines; the game falls back to classic then.
  const real = errors.filter((e) => !/WebGL|GPU|Audio|AudioContext|autoplay/i.test(e));
  expect(real).toEqual([]);
});
