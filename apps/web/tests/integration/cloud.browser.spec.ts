import { test, expect, type Page, type Browser } from '@playwright/test'
import { backend } from './cloud-fixture'
import { reset, sql } from './cloud-db'
import { openHelp, secondary } from '../browser/navigation'
const active = (p: Page) => p.getByTestId('active-card'),
  local = (p: Page) =>
    p.evaluate(() => localStorage.getItem('daily-deck.web.v1'))
test.beforeEach(() => reset())
async function ready(p: Page) {
  await p.goto('/')
  await expect(active(p)).toBeVisible()
}
async function account(p: Page) {
  await expect(p.getByRole('button', {name: 'Today', exact: true})).toBeVisible()
  if (
    await p
      .getByRole('dialog', { name: 'Your account', exact: true })
      .isVisible()
  )
    return
  if(!await p.getByRole('dialog',{name:'Your deck, your pace.',exact:true}).isVisible()){
    // Wait for the new source's controls instead of branching on a transient absence during account switching.
    await p.getByRole('button',{name:'About your local deck',exact:false}).or(p.getByRole('button',{name:'More actions',exact:true})).click()
  }
  await p.getByRole('button',{name:'Manage account',exact:true}).or(p.getByRole('button',{name:'Account',exact:true})).click()
  await expect(
    p.getByRole('dialog', { name: 'Your account', exact: true })
  ).toBeVisible()
}
async function close(p: Page) {
  for (let n = 0; n < 4; n++) {
    const count = await p.getByRole('dialog').count()
    if (!count) return
    await p
      .getByRole('dialog')
      .last()
      .getByRole('button', { name: 'Close dialog', exact: true })
      .click()
    await p.waitForFunction(
      (count) => document.querySelectorAll('dialog[open]').length < count,
      count
    )
  }
}
async function openCloud(p: Page) {
  await account(p)
  await p
    .getByRole('button', {
      name: 'Open cloud deck without importing',
      exact: true
    })
    .click()
  await expect(
    p.getByText('Using this account’s cloud deck.', { exact: true })
  ).toBeVisible()
  await expect(
    p.getByText('Waiting for cloud confirmation…', { exact: true })
  ).toHaveCount(0)
  await expect(p.getByText('Opening cloud deck…', { exact: true })).toHaveCount(
    0
  )
  await close(p)
}
async function create(p: Page, title: string, habit = false) {
  await p.getByRole('button', { name: 'Add a task', exact: true }).click()
  if (habit)
    await p
      .getByRole('button', { name: 'Recurring habit', exact: true })
      .click()
  await p.getByLabel('Title', { exact: true }).fill(title)
  await p.getByLabel('Notes').fill('Account-owned private notes')
  await p
    .getByRole('button', {
      name: habit ? 'Save habit' : 'Save task',
      exact: true
    })
    .click()
  await expect(p.getByRole('dialog')).toHaveCount(0)
  await expect(active(p).locator('h2')).toHaveText(title)
}
async function secondPage(
  browser: Browser,
  b: ReturnType<typeof backend>,
  email = 'authorized@example.test'
) {
  const c = await browser.newContext({
      viewport: { width: 390, height: 844 },
      timezoneId: 'America/New_York'
    }),
    p = await c.newPage()
  await b.install(p, email)
  await ready(p)
  return { p, c }
}
async function refresh(p: Page) {
  await account(p)
  await p.getByRole('button', { name: 'Retry sync', exact: true }).click()
  await expect(
    p.getByText('Waiting for cloud confirmation…', { exact: true })
  ).toHaveCount(0)
  await expect(p.getByText('Opening cloud deck…', { exact: true })).toHaveCount(
    0
  )
  await close(p)
}
async function photo(p: Page) {
  const bytes = await p.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 400
    c.height = 200
    c.getContext('2d')!.fillRect(0, 0, 400, 200)
    return c.toDataURL('image/png').split(',')[1]
  })
  await p.getByLabel('Choose task photo').setInputFiles({
    name: 'private.png',
    mimeType: 'image/png',
    buffer: Buffer.from(bytes, 'base64')
  })
  await p.getByRole('button', { name: 'Use photo', exact: true }).click()
}

test('login does not upload; confirmed import preserves a local backup and shares history with another browser', async ({
  page,
  browser
}) => {
  const b = backend()
  await b.install(page)
  await ready(page)
  await page.getByRole('button', { name: 'Add a task', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('Guest photo history')
  await photo(page)
  await page.getByRole('button', { name: 'Save task', exact: true }).click()
  await expect(
    active(page).getByRole('img', { name: 'Task photo' })
  ).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(active(page).locator('h2')).not.toHaveText('Guest photo history')
  const before = await local(page)
  await account(page)
  expect(b.calls).toHaveLength(0)
  await page
    .getByRole('button', { name: 'Review device import', exact: true })
    .click()
  await expect(
    page.getByText('Store this device’s deck online?', { exact: true })
  ).toBeVisible()
  expect(b.calls.filter((r) => r.body.p_operation === 'import')).toHaveLength(0)
  await page.getByRole('button', { name: 'Cancel import', exact: true }).click()
  expect(await local(page)).toBe(before)
  await page
    .getByRole('button', { name: 'Review device import', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Confirm upload and import', exact: true })
    .click()
  await expect(
    page.getByText('Using this account’s cloud deck.', { exact: true })
  ).toBeVisible()
  await expect(
    page.getByText('Waiting for cloud confirmation…', { exact: true })
  ).toHaveCount(0)
  expect(await local(page)).toBe(before)
  await close(page)
  const { p, c } = await secondPage(browser, b)
  await openCloud(p)
  await expect(active(p).locator('h2')).toHaveText('Walk for 20 minutes')
  await p.getByRole('button', { name: 'Progress', exact: true }).click()
  await expect(
    p.getByRole('button').filter({ hasText: 'Guest photo history' }).first()
  ).toContainText('Completed at')
  expect(
    sql(
      "select count(*) from public.daily_deck_events where action='done'",
      '11111111-1111-1111-1111-111111111111'
    )
  ).toBe('1')
  await account(p)
  await p
    .getByRole('button', { name: 'Review device import', exact: true })
    .click()
  await expect(p.getByRole('alert')).toContainText('already has cloud data')
  expect(b.calls.filter((r) => r.body.p_operation === 'import')).toHaveLength(1)
  await c.close()
  await account(page)
  const download = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Download pre-import backup', exact: true })
    .click()
  expect((await download).suggestedFilename()).toContain('pre-import')
  await page
    .getByRole('button', { name: 'Keep using local deck', exact: true })
    .click()
  await close(page)
  expect(await local(page)).toBe(before)
})

test('two browsers use revision conflicts instead of overwriting edits or completing the wrong card; Later and Undo persist', async ({
  page,
  browser
}) => {
  const b = backend()
  await b.install(page)
  await ready(page)
  await openCloud(page)
  await create(page, 'Shared one')
  const { p, c } = await secondPage(browser, b)
  await openCloud(p)
  await p
    .getByRole('button', { name: 'Edit current task', exact: true })
    .click()
  await p.getByLabel('Title', { exact: true }).fill('Stale B edit')
  await page
    .getByRole('button', { name: 'Edit current task', exact: true })
    .click()
  await page.getByLabel('Title', { exact: true }).fill('A revised')
  await page.getByRole('button', { name: 'Save task', exact: true }).click()
  await expect(active(page).locator('h2')).toHaveText('A revised')
  // Focus refresh must not silently upgrade the base revision of an open form.
  await p.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(active(p).locator('h2')).toHaveText('A revised')
  await p.getByRole('button', { name: 'Save task', exact: true }).click()
  await expect(p.getByRole('dialog').last()).toContainText(
    'changed in another browser'
  )
  await expect(p.getByLabel('Title', { exact: true })).toHaveValue(
    'Stale B edit'
  )
  await p.getByRole('button', { name: 'Cancel', exact: true }).click()
  await p.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(active(p).locator('h2')).toHaveText('A revised')
  await create(page, 'New first')
  await p.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(p.getByRole('alert')).toContainText('changed in another browser')
  expect(
    sql(
      "select count(*) from public.daily_deck_events where action='done'",
      '11111111-1111-1111-1111-111111111111'
    )
  ).toBe('0')
  await refresh(p)
  await expect(active(p).locator('h2')).toHaveText('New first')
  await p.getByRole('button', { name: 'Later', exact: true }).click()
  await expect(active(p).locator('h2')).toHaveText('A revised')
  await secondary(p, 'Undo last action')
  await expect(active(p).locator('h2')).toHaveText('New first')
  await secondary(p, 'Reorder deck')
  await p
    .getByRole('button', { name: 'Move New first down', exact: true })
    .click()
  await p
    .getByRole('dialog', { name: 'A little order' })
    .getByRole('button', { name: 'Done', exact: true })
    .click()
  await expect(active(p).locator('h2')).toHaveText('A revised')
  await p.reload()
  await expect(active(p).locator('h2')).toHaveText('A revised')
  await refresh(page)
  await expect(active(page).locator('h2')).toHaveText('A revised')
  await c.close()
})

test('private photo originals/crops reach a second browser; replacement keeps history and cleanup preserves referenced files', async ({
  page,
  browser
}) => {
  const b = backend()
  await b.install(page)
  await ready(page)
  await openCloud(page)
  await page.getByRole('button', { name: 'Add a task', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('Cloud photo')
  await photo(page)
  await page.getByRole('button', { name: 'Save task', exact: true }).click()
  await expect(
    active(page).getByRole('img', { name: 'Task photo' })
  ).toBeVisible()
  expect(b.bytes.size).toBe(2)
  const { p, c } = await secondPage(browser, b)
  await openCloud(p)
  await expect(active(p).getByRole('img', { name: 'Task photo' })).toBeVisible()
  await p
    .getByRole('button', { name: 'Edit current task', exact: true })
    .click()
  await p.getByRole('button', { name: 'Adjust photo', exact: true }).click()
  await expect(p.getByRole('dialog', { name: 'Adjust photo' })).toBeVisible()
  await p
    .getByRole('dialog', { name: 'Adjust photo' })
    .getByRole('button', { name: 'Cancel', exact: true })
    .click()
  await p.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page
    .getByRole('button', { name: 'Edit current task', exact: true })
    .click()
  await photo(page)
  await page.getByRole('button', { name: 'Save task', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(b.bytes.size).toBe(4)
  await account(page)
  await page
    .getByRole('button', { name: 'Clean up unused cloud photos', exact: true })
    .click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Referenced historical photos' })
  ).toBeVisible()
  expect(b.bytes.size).toBe(4)
  await c.close()
})

test('lost save and import responses retry idempotently; offline mode does not claim a save', async ({
  page
}) => {
  const b = backend()
  await b.install(page)
  await ready(page)
  const guest = await local(page)
  await account(page)
  await page
    .getByRole('button', { name: 'Review device import', exact: true })
    .click()
  b.state.dropAfterCommit = true
  await page
    .getByRole('button', { name: 'Confirm upload and import', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Retry pending save', exact: true })
  ).toBeEnabled()
  expect(await local(page)).toBe(guest)
  await page
    .getByRole('button', { name: 'Retry pending save', exact: true })
    .click()
  await expect(
    page.getByText('Using this account’s cloud deck.', { exact: true })
  ).toBeVisible()
  await close(page)
  await page.getByRole('button', { name: 'Add a task', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('Retry once')
  b.state.dropAfterCommit = true
  await page.getByRole('button', { name: 'Save task', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Retry pending cloud save', exact: true })
  ).toBeEnabled()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
    'Retry once'
  )
  await page
    .getByRole('button', { name: 'Retry pending cloud save', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toContainText(
    'original save was confirmed'
  )
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(active(page).locator('h2')).toHaveText('Retry once')
  expect(
    sql(
      "select count(*) from public.daily_deck_items where title='Retry once'",
      '11111111-1111-1111-1111-111111111111'
    )
  ).toBe('1')
  b.state.offline = true
  await account(page)
  await page.getByRole('button', { name: 'Retry sync', exact: true }).click()
  await expect(
    page.getByRole('dialog').last().getByRole('alert').first()
  ).toBeVisible()
  await close(page)
  await page.getByRole('button', { name: 'Add a task', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('Offline draft')
  await page.getByRole('button', { name: 'Save task', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Reconnect')
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
    'Offline draft'
  )
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  b.state.offline = false
  await refresh(page)
  await create(page, 'Online again')
  expect(await local(page)).toBe(guest)
})

test('logout/account switching hide caches and never upload another account’s data', async ({
  page
}) => {
  const b = backend()
  await b.install(page)
  await ready(page)
  const guest = await local(page)
  await openCloud(page)
  await create(page, 'A only private task')
  await account(page)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.locator('body')).not.toContainText('A only private task')
  await page.getByLabel('Email', { exact: true }).fill('second@example.test')
  await page
    .getByLabel('Password', { exact: true })
    .fill('synthetic-password-only')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Your account' })).toBeVisible()
  await page
    .getByRole('button', {
      name: 'Open cloud deck without importing',
      exact: true
    })
    .click()
  await expect(
    page.getByText('Using this account’s cloud deck.', { exact: true })
  ).toBeVisible()
  await close(page)
  await expect(active(page)).toHaveCount(0)
  await create(page, 'B only private task')
  expect(
    sql(
      'select count(*) from public.daily_deck_items',
      '22222222-2222-2222-2222-222222222222'
    )
  ).toBe('1')
  expect(
    sql(
      "select count(*) from public.daily_deck_items where title like 'A only%'",
      '22222222-2222-2222-2222-222222222222'
    )
  ).toBe('0')
  expect(await local(page)).toBe(guest)
})

test('cloud habit creation, scheduling, deletion and mobile account controls preserve guest data', async ({
  page
}, info) => {
  const b = backend()
  await b.install(page)
  await ready(page)
  const guest = await local(page)
  await openCloud(page)
  await create(page, 'Shared daily habit', true)
  await page.getByRole('button', { name: 'Later', exact: true }).click()
  await expect(active(page).locator('h2')).toHaveText('Shared daily habit')
  await page.getByRole('button', { name: 'Habits', exact: true }).click()
  await expect(
    page.locator('.habit-card').filter({
      has: page.getByRole('heading', {
        name: 'Shared daily habit',
        exact: true
      })
    })
  ).toBeVisible()
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await page
    .getByRole('button', { name: 'Edit current task', exact: true })
    .click()
  await page.getByRole('button', { name: 'Delete habit', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Delete habit?', exact: true })
    .getByRole('button', { name: 'Delete habit', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.reload()
  await expect(active(page)).toHaveCount(0)
  await account(page)
  for (const width of [320, 375, 390]) {
    await page.setViewportSize({ width, height: 400 })
    await page.evaluate(
      () =>
        new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r()))
        )
    )
    const m = await page
      .getByRole('dialog')
      .last()
      .evaluate((el) => ({
        width: el.scrollWidth,
        client: el.clientWidth,
        left: el.getBoundingClientRect().left,
        right: el.getBoundingClientRect().right
      }))
    expect(m.width).toBeLessThanOrEqual(m.client + 1)
    expect(m.left).toBeGreaterThanOrEqual(0)
    expect(m.right).toBeLessThanOrEqual(width + 1)
    if (width === 375) {
      await page
        .getByRole('dialog')
        .last()
        .locator('.modal-content')
        .evaluate((el) => {
          el.scrollTop = el.scrollHeight
        })
      await page.screenshot({
        path: `/tmp/dailydeck-cloud-${info.project.name}-account-375.png`
      })
    }
  }
  expect(await local(page)).toBe(guest)
})

test('interrupted photo upload and cleanup can be retried without deleting historical images', async ({
  page,
  browser
}) => {
  const b = backend()
  await b.install(page)
  await ready(page)
  await openCloud(page)
  await page.getByRole('button', { name: 'Add a task', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('Retried photo')
  await photo(page)
  b.state.failUploadAt = 2
  await page.getByRole('button', { name: 'Save task', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Retry pending cloud save', exact: true })
  ).toBeEnabled()
  expect(b.bytes.size).toBe(1)
  await page
    .getByRole('button', { name: 'Retry pending cloud save', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toContainText(
    'original save was confirmed'
  )
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(
    active(page).getByRole('img', { name: 'Task photo' })
  ).toBeVisible()
  expect(b.bytes.size).toBe(2)
  const { p, c } = await secondPage(browser, b)
  await openCloud(p)
  let release!: () => void
  b.state.uploadStarted = false
  b.state.holdUpload = new Promise((r) => (release = r))
  await page.getByRole('button', { name: 'Add a task', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('Stale photo draft')
  await photo(page)
  await page.getByRole('button', { name: 'Save task', exact: true }).click()
  await expect.poll(() => b.state.uploadStarted).toBe(true)
  await create(p, 'Concurrent insert')
  release()
  b.state.holdUpload = null
  await expect(page.getByRole('dialog').last()).toContainText(
    'changed in another browser'
  )
  expect(b.bytes.size).toBe(4)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await account(page)
  b.state.failDelete = true
  await page
    .getByRole('button', { name: 'Clean up unused cloud photos', exact: true })
    .click()
  await expect(
    page.getByRole('dialog').last().getByRole('alert')
  ).toContainText('cleanup')
  expect(b.bytes.size).toBe(4)
  await page
    .getByRole('button', { name: 'Clean up unused cloud photos', exact: true })
    .click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Referenced historical photos' })
  ).toBeVisible()
  expect(b.bytes.size).toBe(2)
  await c.close()
})

test('an account change during a photo save cannot upload or write into the new account', async ({
  page
}) => {
  const b = backend(),
    f = await b.install(page)
  await ready(page)
  const guest = await local(page)
  await openCloud(page)
  await create(page, 'A existing')
  let release!: () => void
  b.state.holdUpload = new Promise((r) => (release = r))
  await page.getByRole('button', { name: 'Add a task', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('Interrupted A photo')
  await photo(page)
  await page.getByRole('button', { name: 'Save task', exact: true }).click()
  await expect.poll(() => b.state.uploadStarted).toBe(true)
  async function switchTo(email: string) {
    await page.evaluate((s) => {
      localStorage.setItem('sb-auth-fixture-auth-token', JSON.stringify(s))
      const c = new BroadcastChannel('sb-auth-fixture-auth-token')
      c.postMessage({ event: 'SIGNED_IN', session: s })
      c.close()
    }, f.session(email))
  }
  await switchTo('second@example.test')
  await expect(active(page).locator('h2')).toHaveText('Walk for 20 minutes')
  release()
  b.state.holdUpload = null
  await account(page)
  await expect(
    page.getByRole('dialog', { name: 'Your account' })
  ).toContainText('second@example.test')
  await expect(
    page.getByRole('button', { name: 'Retry pending save', exact: true })
  ).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('Interrupted A photo')
  expect(
    b.calls.filter(
      (r) =>
        r.owner === '22222222-2222-2222-2222-222222222222' &&
        r.path.startsWith('/storage/')
    )
  ).toHaveLength(0)
  expect(await local(page)).toBe(guest)
  await close(page)
  await switchTo('authorized@example.test')
  await account(page)
  await expect(
    page.getByRole('button', { name: 'Retry pending save', exact: true })
  ).toBeEnabled()
  await page
    .getByRole('button', { name: 'Retry pending save', exact: true })
    .click()
  await expect(
    page.getByText('Waiting for cloud confirmation…', { exact: true })
  ).toHaveCount(0)
  await close(page)
  await expect(active(page).locator('h2')).toHaveText('Interrupted A photo')
  expect(
    sql(
      'select count(*) from public.daily_deck_items',
      '22222222-2222-2222-2222-222222222222'
    )
  ).toBe('0')
  expect(await local(page)).toBe(guest)
})

test('expired cloud authorization keeps the original request for reauthentication and explicit retry', async ({
  page
}) => {
  const b = backend()
  await b.install(page)
  await ready(page)
  await openCloud(page)
  await page.getByRole('button', { name: 'Add a task', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('Authorized retry')
  b.state.expired = true
  await page.getByRole('button', { name: 'Save task', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText(
    'Sign in to the same account'
  )
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
    'Authorized retry'
  )
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await account(page)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  b.state.expired = false
  await page
    .getByLabel('Email', { exact: true })
    .fill('authorized@example.test')
  await page
    .getByLabel('Password', { exact: true })
    .fill('synthetic-password-only')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Retry pending save', exact: true })
  ).toBeEnabled()
  await page
    .getByRole('button', { name: 'Retry pending save', exact: true })
    .click()
  await expect(
    page.getByText('Waiting for cloud confirmation…', { exact: true })
  ).toHaveCount(0)
  await close(page)
  await expect(active(page).locator('h2')).toHaveText('Authorized retry')
  expect(
    sql(
      "select count(*) from public.daily_deck_items where title='Authorized retry'",
      '11111111-1111-1111-1111-111111111111'
    )
  ).toBe('1')
})


test('rejected cross-device save stays visible after queued/background refresh and preserves its draft',async({page,browser},info)=>{
 const b=backend();await b.install(page);await ready(page);await openCloud(page);await create(page,'Original task')
 const {p,c}=await secondPage(browser,b);await openCloud(p)
 for(const target of [page,p])await target.getByRole('button',{name:'Edit current task',exact:true}).click()
 await page.getByLabel('Title',{exact:true}).fill('computer edit')
 await page.getByLabel('Notes').fill('Keep this rejected desktop draft')
 await p.getByLabel('Title',{exact:true}).fill('phone edit')
 let release!:()=>void;b.state.holdSaveTitle='computer edit';b.state.holdSave=new Promise<void>(r=>release=r)
 const rejected=page.waitForResponse(r=>r.url().endsWith('/rpc/daily_deck_sync')&&r.request().postDataJSON()?.p_args?.task?.title==='computer edit')
 await page.getByRole('button',{name:'Save task',exact:true}).click()
 await expect(page.getByRole('button',{name:'Saving…',exact:true})).toBeVisible()
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await p.getByRole('button',{name:'Save task',exact:true}).click()
 await expect(active(p).locator('h2')).toHaveText('phone edit')
 release();b.state.holdSave=null
 expect((await (await rejected).json()).code).toBe('40001')
 const dialog=page.getByRole('dialog',{name:'Edit task',exact:true}),alert=dialog.getByRole('alert')
 await expect(alert).toContainText('changed in another browser')
 await expect(alert).toBeInViewport()
 const viewport=page.viewportSize()!;await page.setViewportSize({width:320,height:400});await expect(alert).toBeInViewport();await expect(page.getByRole('button',{name:'Save task',exact:true})).toBeInViewport();await page.setViewportSize(viewport)
 await expect(page.getByRole('button',{name:'Save task',exact:true})).toBeEnabled()
 await expect(page.getByLabel('Title',{exact:true})).toHaveValue('computer edit')
 await expect(page.getByLabel('Notes')).toHaveValue('Keep this rejected desktop draft')
 await expect(active(page).locator('h2')).toHaveText('phone edit')
 for(let n=0;n<2;n++){await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(alert).toBeVisible()}
 await page.getByRole('button',{name:'Check latest saved version',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'Latest saved version'})).toContainText('phone edit')
 await page.getByRole('button',{name:'Back to my draft',exact:true}).click()
 await expect(page.getByLabel('Title',{exact:true})).toHaveValue('computer edit')
 // Reviewing/refetching never rebases a rejected draft. Another Save must still reject.
 await page.getByRole('button',{name:'Save task',exact:true}).click()
 await expect(alert).toContainText('changed in another browser')
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{(window as any).copiedDraft=text}}}))
 await page.getByRole('button',{name:'Copy draft text',exact:true}).click()
 await expect(dialog.getByRole('status')).toContainText('Draft copied')
 expect(await page.evaluate(()=>(window as any).copiedDraft)).toContain('computer edit')
 expect(sql("select title from public.daily_deck_items where title='phone edit'",'11111111-1111-1111-1111-111111111111')).toBe('phone edit')
 await page.screenshot({path:`/tmp/dailydeck-edit-conflict-${info.project.name}.png`})
 await page.getByRole('button',{name:'Cancel',exact:true}).click()
 await expect(active(page).locator('h2')).toHaveText('phone edit')
 await c.close()
})

test('sequential edits resolve successfully; a refreshed open stale form cannot overwrite the newer save',async({page,browser})=>{
 const b=backend();await b.install(page);await ready(page);await openCloud(page);await create(page,'Starting title')
 const {p,c}=await secondPage(browser,b);await openCloud(p)
 await page.getByRole('button',{name:'Edit current task',exact:true}).click()
 await page.getByLabel('Title',{exact:true}).fill('computer edit')
 await page.getByRole('button',{name:'Save task',exact:true}).click()
 await expect(page.getByRole('dialog')).toHaveCount(0)
 await expect(active(page).locator('h2')).toHaveText('computer edit')
 await refresh(p)
 await p.getByRole('button',{name:'Edit current task',exact:true}).click()
 await expect(p.getByLabel('Title',{exact:true})).toHaveValue('computer edit')
 await p.getByLabel('Title',{exact:true}).fill('phone edit')
 await p.getByRole('button',{name:'Save task',exact:true}).click()
 await expect(p.getByRole('dialog')).toHaveCount(0)
 await expect(active(p).locator('h2')).toHaveText('phone edit')
 await refresh(page)
 await expect(active(page).locator('h2')).toHaveText('phone edit')
 await page.getByRole('button',{name:'Edit current task',exact:true}).click()
 await expect(page.getByLabel('Title',{exact:true})).toHaveValue('phone edit')
 await page.getByLabel('Title',{exact:true}).fill('Final reviewed edit')
 await page.getByRole('button',{name:'Save task',exact:true}).click()
 await expect(page.getByRole('dialog')).toHaveCount(0)
 await expect(active(page).locator('h2')).toHaveText('Final reviewed edit')
 await c.close()
})


test('an unknown save outcome remains visible through refresh and retry confirms the original request',async({page})=>{
 const b=backend();await b.install(page);await ready(page);await openCloud(page);await create(page,'Before response loss')
 await page.getByRole('button',{name:'Edit current task',exact:true}).click()
 await page.getByLabel('Title',{exact:true}).fill('Saved but response lost')
 b.state.dropAfterCommit=true
 await page.getByRole('button',{name:'Save task',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'Edit task',exact:true})
 await expect(dialog.getByRole('alert')).toContainText('Save not confirmed')
 await expect(page.getByRole('button',{name:'Save task',exact:true})).toBeDisabled()
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await expect(active(page).locator('h2')).toHaveText('Saved but response lost')
 await expect(dialog.getByRole('alert')).toContainText('Save not confirmed')
 await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Saved but response lost')
 await page.getByRole('button',{name:'Retry pending cloud save',exact:true}).click()
 await expect(dialog.getByRole('status')).toContainText('The original save was confirmed')
 await expect(dialog.getByRole('alert')).toHaveCount(0)
 await page.getByRole('button',{name:'Cancel',exact:true}).click()
 await expect(active(page).locator('h2')).toHaveText('Saved but response lost')
})
