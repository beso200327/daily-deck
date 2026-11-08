import { afterEach, it, expect, vi } from 'vitest'
vi.mock('../src/supabase', () => ({
  supabaseConfiguration: {
    status: 'configured',
    url: 'https://synthetic-unit.supabase.co',
    key: 'sb_publishable_synthetic_unit_only'
  }
}))
import { bindAccountClient } from '../src/cloud-api'
const A = '11111111-1111-1111-1111-111111111111',
  B = '22222222-2222-2222-2222-222222222222'
afterEach(() => vi.unstubAllGlobals())
it('data-only clients retain the verified initiating token when global Auth switches', async () => {
  let owner = A,
    token = 'synthetic-initiating-account-a'
  const base = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: owner }, access_token: token } },
        error: null
      })),
      getUser: vi.fn(async () => ({
        data: { user: { id: owner } },
        error: null
      }))
    }
  }
  const fetch = vi.fn(async (_input: any, init: any) => {
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer synthetic-initiating-account-a'
    )
    return new Response('{}', {
      headers: { 'content-type': 'application/json' }
    })
  })
  vi.stubGlobal('fetch', fetch)
  const bound = await bindAccountClient(base as any, A, () => {})
  owner = B
  token = 'synthetic-other-account-b'
  await bound.rpc('synthetic_test_only', {})
  expect(fetch).toHaveBeenCalledOnce()
  expect(base.auth.getUser).toHaveBeenCalledWith(
    'synthetic-initiating-account-a'
  )
})
it('cached user metadata alone cannot authorize a pinned client', async () => {
  const base = {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: A }, access_token: 'synthetic-only' } },
        error: null
      }),
      getUser: async () => ({ data: { user: { id: B } }, error: null })
    }
  }
  await expect(bindAccountClient(base as any, A, () => {})).rejects.toThrow(
    'could not be verified'
  )
})
it('identity changes during session verification stop the operation', async () => {
  let changed = false
  const base = {
    auth: {
      getSession: async () => {
        changed = true
        return {
          data: {
            session: { user: { id: A }, access_token: 'synthetic-only' }
          },
          error: null
        }
      },
      getUser: vi.fn()
    }
  }
  await expect(
    bindAccountClient(base as any, A, () => {
      if (changed) throw new Error('Account changed')
    })
  ).rejects.toThrow('Account changed')
  expect(base.auth.getUser).not.toHaveBeenCalled()
})
