import {defineConfig} from '@playwright/test'
import base from './playwright.config'
export default defineConfig({
 testDir:'tests/integration',testMatch:'supabase.browser.spec.ts',fullyParallel:false,workers:2,reporter:'list',
 use:{...base.use,baseURL:'http://127.0.0.1:4175'},projects:base.projects,
 webServer:[
  {command:'npm run preview -- --port 4173 --strictPort',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI},
  // Synthetic public configuration only. These values are NOT hosted credentials.
  {command:'VITE_SUPABASE_URL=https://foundation-fixture.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_synthetic_test_key_not_a_real_credential npm run build -- --outDir dist-supabase-test && npm run preview -- --outDir dist-supabase-test --port 4175 --strictPort',url:'http://127.0.0.1:4175',reuseExistingServer:!process.env.CI},
 ],
})
