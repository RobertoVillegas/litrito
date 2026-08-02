import { expect, test } from '@playwright/test'

test('health, hydration, station reads and search stay operational', async ({ page }) => {
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })

  const health = await page.request.get('/api/health')
  expect(health.ok()).toBe(true)
  await expect(health.json()).resolves.toMatchObject({ status: 'ok', database: 'ok' })

  await page.goto('/explorar')
  await expect(page.getByText(/\d+ (cargados|resultados)/).first()).toBeVisible()
  await expect(page.getByRole('row').nth(1)).toBeVisible()

  const search = page.getByPlaceholder('Buscar por nombre o dirección')
  await search.fill('Pemex')
  await expect(page.getByRole('link', { name: /Pem.x Centro/ })).toBeVisible()

  expect(browserErrors).toEqual([])
})
