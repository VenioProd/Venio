import { expect, test } from '@playwright/test'

const captures = 'test-results/public-captures'

for (const viewport of [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 1000 },
]) {
  test(`home is usable at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await expect(page).toHaveTitle(/Venio/i)
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page.locator('main, #root')).toBeVisible()
    await expect(page.locator('img:not([alt])')).toHaveCount(0)
    await page.screenshot({ path: `${captures}/home-${viewport.name}.png`, fullPage: true })
  })
}

test('contact form uses the deterministic test transport and records a success state', async ({ page }) => {
  await page.route('**/api/contact', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        message: 'Merci, votre message a bien été reçu. Nous vous répondrons sous 48 h ouvrées.',
      }),
    })
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/contact')
  await expect(page.getByRole('textbox', { name: 'Prénom', exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Nom', exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Votre besoin', exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Votre message', exact: true })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: /J’accepte que Venio utilise ces informations/ })).toBeVisible()
  await page.getByPlaceholder('Prénom').fill('Ada')
  await page.getByPlaceholder('Nom', { exact: true }).fill('Lovelace')
  await page.getByPlaceholder('Email').fill('ada@example.test')
  await page.locator('select[name="sujet"]').selectOption({ label: 'Un site web' })
  await page.getByPlaceholder('Votre message').fill('Bonjour, voici un projet de test.')
  await page.getByRole('checkbox', { name: /J’accepte que Venio utilise ces informations/ }).check()
  await page.getByRole('button', { name: 'Envoyer' }).click()
  await expect(page.getByText('Merci, votre message a bien été reçu. Nous vous répondrons sous 48 h ouvrées.')).toBeVisible()
  await page.screenshot({ path: `${captures}/contact-mobile.png`, fullPage: true })
})
