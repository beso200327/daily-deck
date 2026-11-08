import type { Page, Route } from '@playwright/test'
import { installAuth, first, second } from './auth-fixture'
import { sql, quote } from './cloud-db'
export function backend() {
  const bytes = new Map<string, { body: Buffer; type: string }>(),
    calls: { owner: string; path: string; body: any }[] = []
  const state = {
    dropAfterCommit: false,
    offline: false,
    hold: null as null | Promise<void>,
    uploads: 0,
    failUploadAt: 0,
    holdUpload: null as null | Promise<void>,
    uploadStarted: false,
    failDelete: false,
    expired: false
  }
  const extension = async (route: Route, owner: string | null) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname
    let body: any = {}
    try {
      body = req.postDataJSON() ?? {}
    } catch {}
    if (
      !path.startsWith('/storage/') &&
      !['daily_deck_sync', 'daily_deck_sync_status', 'daily_deck_photo'].some(
        (n) => path === '/rest/v1/rpc/' + n
      )
    )
      return false
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-expose-headers': '*',
      'content-type': 'application/json'
    }
    const send = async (value: unknown, status = 200) => {
      await route.fulfill({ status, headers, body: JSON.stringify(value) })
      return true
    }
    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers })
      return true
    }
    if (state.offline) {
      await route.abort()
      return true
    }
    if (state.expired)
      return send(
        { code: 'PGRST301', message: 'Synthetic session expired' },
        401
      )
    if (!owner)
      return send({ code: '42501', message: 'Synthetic session required' }, 401)
    calls.push({ owner, path, body })
    try {
      if (path.startsWith('/rest/v1/rpc/')) {
        if (state.hold) await state.hold
        let statement: string
        if (path.endsWith('daily_deck_sync'))
          statement = `select public.daily_deck_sync(${quote(body.p_expected_user)}::uuid,${quote(body.p_operation)},${quote(body.p_request_id)}::uuid,${quote(body.p_revision)}::bigint,${quote(JSON.stringify(body.p_args))}::jsonb,${quote(body.p_timezone)})`
        else if (path.endsWith('daily_deck_sync_status'))
          statement = `select public.daily_deck_sync_status(${quote(body.p_expected_user)}::uuid,${quote(body.p_request_id)}::uuid)`
        else
          statement = `select public.daily_deck_photo(${quote(body.p_expected_user)}::uuid,${quote(body.p_id)}::uuid,${quote(body.p_metadata ? JSON.stringify(body.p_metadata) : null)}::jsonb,${body.p_cleanup === true ? 'true' : 'false'})`
        const result = JSON.parse(sql(statement, owner))
        if (
          state.dropAfterCommit &&
          body.p_operation &&
          body.p_operation !== 'read'
        ) {
          state.dropAfterCommit = false
          await route.abort()
          return true
        }
        return send(result)
      }
      const list = '/storage/v1/object/list/daily-deck-photos',
        base = '/storage/v1/object/daily-deck-photos',
        download = '/storage/v1/object/authenticated/daily-deck-photos/'
      if (path === list) {
        const prefix = String(body.prefix ?? '').replace(/\/$/, ''),
          names = JSON.parse(
            sql(
              "select coalesce(json_agg(name),'[]') from storage.objects where bucket_id='daily-deck-photos'",
              owner
            )
          ) as string[]
        const direct = new Map<string, any>()
        for (const name of names.filter((p) => p.startsWith(prefix + '/'))) {
          const rest = name.slice(prefix.length + 1),
            namePart = rest.split('/')[0]
          direct.set(namePart, {
            name: namePart,
            id: rest.includes('/') ? null : namePart,
            metadata: rest.includes('/') ? null : {}
          })
        }
        return send(
          [...direct.values()]
            .sort((a, b) => a.name.localeCompare(b.name))
            .slice(body.offset ?? 0, (body.offset ?? 0) + (body.limit ?? 100))
        )
      }
      if (
        req.method() === 'GET' &&
        (path.startsWith(download) || path.startsWith(base + '/'))
      ) {
        const name = decodeURIComponent(
            path.slice(
              path.startsWith(download) ? download.length : base.length + 1
            )
          ),
          allowed =
            sql(
              `select count(*) from storage.objects where bucket_id='daily-deck-photos' and name=${quote(name)}`,
              owner
            ) === '1',
          blob = bytes.get(name)
        if (!allowed || !blob) return send({ message: 'Not found' }, 404)
        await route.fulfill({
          status: 200,
          headers: { ...headers, 'content-type': blob.type },
          body: blob.body
        })
        return true
      }
      if (req.method() === 'POST' && path.startsWith(base + '/')) {
        state.uploadStarted = true
        if (state.holdUpload) await state.holdUpload
        if (state.failUploadAt === state.uploads + 1) {
          state.failUploadAt = 0
          await route.abort()
          return true
        }
        const name = decodeURIComponent(path.slice(base.length + 1)),
          data = req.postDataBuffer()!,
          type = req.headers()['content-type']
        sql(
          `insert into storage.objects(bucket_id,name,metadata) values('daily-deck-photos',${quote(name)},${quote(JSON.stringify({ size: data.length, mimetype: type }))}::jsonb)`,
          owner
        )
        bytes.set(name, { body: data, type })
        state.uploads++
        return send({
          Key: 'daily-deck-photos/' + name,
          Id: crypto.randomUUID()
        })
      }
      if (req.method() === 'DELETE' && path === base) {
        if (state.failDelete) {
          state.failDelete = false
          await route.abort()
          return true
        }
        const names = JSON.parse(
          sql(
            `with deleted as(delete from storage.objects where bucket_id='daily-deck-photos' and name=any(array[${(body.prefixes ?? []).map(quote).join(',')}]::text[]) returning name) select coalesce(json_agg(name),'[]') from deleted`,
            owner
          )
        ) as string[]
        for (const name of names) bytes.delete(name)
        return send(names.map((name) => ({ name })))
      }
      return send({ message: 'Unexpected synthetic storage route' }, 500)
    } catch (e) {
      const text =
        e && typeof e === 'object' && 'stderr' in e ? String(e.stderr) : ''
      const code = /ERROR:\s+([0-9A-Z]{5}):/.exec(text)?.[1] ?? 'XX000'
      return send(
        {
          code,
          message: 'Isolated database rejected the request',
          statusCode: code === '23505' ? '409' : '400'
        },
        code === '23505' ? 409 : 400
      )
    }
  }
  async function install(page: Page, email = 'authorized@example.test') {
    const f = await installAuth(page, extension)
    f.fixture.approved.add(first)
    f.fixture.approved.add(second)
    await page.addInitScript((value) => {
      if (!localStorage.getItem('sb-auth-fixture-auth-token'))
        localStorage.setItem(
          'sb-auth-fixture-auth-token',
          JSON.stringify(value)
        )
    }, f.session(email))
    return f
  }
  return { install, state, calls, bytes }
}
