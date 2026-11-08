import { defineConfig } from '@playwright/test'
import base from './playwright.config'
export default defineConfig({
  testDir: 'tests/integration',
  testMatch: 'cloud.browser.spec.ts',
  globalSetup: './tests/integration/cloud-db.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  outputDir: '/tmp/dailydeck-cloud-browser-results',
  reporter: 'list',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4177' },
  projects: base.projects,
  webServer: [
    {
      command:
        'VITE_SUPABASE_URL=https://auth-fixture.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_synthetic_cloud_test_only npm run build -- --mode auth-test --outDir dist-cloud-test && npm run preview -- --outDir dist-cloud-test --port 4177 --strictPort',
      url: 'http://127.0.0.1:4177',
      reuseExistingServer: false
    }
  ]
})
