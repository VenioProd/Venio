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

test('qualification form walks the five steps and sends the need summary', async ({ page }) => {
  let payload: Record<string, unknown> | null = null
  await page.route('**/api/contact', async (route) => {
    payload = route.request().postDataJSON() as Record<string, unknown>
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
  const next = page.getByRole('button', { name: /Continuer|Envoyer ma demande/ })

  // 1 · Besoin
  await page.getByRole('button', { name: /Mieux communiquer/ }).click()
  await next.click()
  // 2 · Précisions, propres au besoin choisi
  await page.getByRole('button', { name: 'Pas assez de demandes' }).click()
  await expect(
    page.getByRole('complementary', { name: 'Relevé de votre besoin' }).getByText('Acquisition et mesure'),
  ).toBeVisible()
  await next.click()
  // 3 · Entreprise, 4 · Cadre : facultatifs
  await next.click()
  await next.click()
  // 5 · Coordonnées
  await page.getByLabel('Prénom').fill('Ada')
  await page.getByLabel('E-mail').fill('ada@example.test')
  await page.getByRole('checkbox', { name: /J'accepte que Venio utilise ces informations/ }).check()
  await next.click()

  await expect(page.getByText(/C'est noté, Ada\./)).toBeVisible()
  expect(payload).not.toBeNull()
  expect((payload as unknown as { qualification: { need: string[]; pain: string[] } }).qualification).toMatchObject({
    need: ['com'],
    pain: ['demandes'],
  })
  await page.screenshot({ path: `${captures}/contact-mobile.png`, fullPage: true })
})

test('old « Au-delà du site » address leads to the consulting page', async ({ page }) => {
  await page.goto('/au-dela-du-site')
  await expect(page).toHaveURL(/\/conseil-communication$/)
  await expect(page.locator('h1')).toHaveCount(1)
})
