import { afterEach, describe, expect, it } from 'vitest'
import { getConfiguredSiteOrigin } from './site-url'

const originalAppDomain = process.env.APP_DOMAIN
const originalViteAppDomain = process.env.VITE_APP_DOMAIN

afterEach(() => {
  if (originalAppDomain === undefined) delete process.env.APP_DOMAIN
  else process.env.APP_DOMAIN = originalAppDomain

  if (originalViteAppDomain === undefined) delete process.env.VITE_APP_DOMAIN
  else process.env.VITE_APP_DOMAIN = originalViteAppDomain
})

describe('getConfiguredSiteOrigin', () => {
  it('uses runtime APP_DOMAIN and adds https when needed', () => {
    process.env.APP_DOMAIN = 'litrito.com'
    delete process.env.VITE_APP_DOMAIN

    expect(getConfiguredSiteOrigin()).toBe('https://litrito.com')
  })

  it('preserves explicit protocols', () => {
    process.env.APP_DOMAIN = 'http://localhost:3000'

    expect(getConfiguredSiteOrigin()).toBe('http://localhost:3000')
  })

  it('falls back to VITE_APP_DOMAIN when APP_DOMAIN is not set', () => {
    delete process.env.APP_DOMAIN
    process.env.VITE_APP_DOMAIN = 'https://litrito.mx'

    expect(getConfiguredSiteOrigin()).toBe('https://litrito.mx')
  })
})
