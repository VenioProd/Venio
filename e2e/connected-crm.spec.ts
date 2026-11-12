import { expect, test } from '@playwright/test'

test('un administrateur se connecte et ouvre la table des leads', async ({ page }) => {
  test.skip(process.env.VENIO_E2E_CONNECTED !== '1', 'Requires the in-memory backend')
  await page.goto('/admin/login')
  await page.locator('input[type="email"]').fill('contact@venio.paris')
  await page.locator('input[type="password"]').fill('Preview1234!')
  await page.locator('button[type="submit"]').click()
  await expect(page).not.toHaveURL(/\/admin\/login/)
  await page.goto('/admin/crm')
  const leads = page.locator('table.rich-table')
  await expect(leads).toBeVisible()
  await expect(leads.locator('tbody tr').first()).toBeVisible({ timeout: 30_000 })
})
