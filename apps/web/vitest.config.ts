import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['tests/deck.test.ts'], environment: 'node' } })
