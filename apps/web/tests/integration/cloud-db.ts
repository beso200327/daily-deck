import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readdirSync } from 'node:fs'
export const root = fileURLToPath(new URL('../../../../', import.meta.url))
const image =
  'postgres@sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994'
export const docker = (args: string[]) =>
  execFileSync('docker', ['--host=unix:///var/run/docker.sock', ...args], {
    encoding: 'utf8',
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        ([k]) =>
          ![
            'DOCKER_HOST',
            'DOCKER_CONTEXT',
            'DOCKER_TLS',
            'DOCKER_TLS_VERIFY',
            'DOCKER_CERT_PATH'
          ].includes(k)
      )
    ),
    stdio: ['pipe', 'pipe', 'pipe']
  })
export const container = () => {
  const v = process.env.DAILY_DECK_CLOUD_TEST_CONTAINER
  if (!v || !/^dailydeck-cloud-browser-[a-f0-9]+$/.test(v))
    throw new Error('Missing disposable test container')
  return v
}
export const quote = (v: unknown) =>
  v === null || v === undefined
    ? 'null'
    : "'" + String(v).replaceAll("'", "''") + "'"
export function sql(statement: string, owner?: string) {
  return docker([
    'exec',
    container(),
    'psql',
    '-X',
    '-qAt',
    '--set',
    'ON_ERROR_STOP=1',
    '--set',
    'VERBOSITY=verbose',
    '-U',
    'postgres',
    '-d',
    'dailydeck_test',
    '-c',
    owner
      ? `begin;set local role authenticated;set local "request.jwt.claim.sub"=${quote(owner)};set local "request.jwt.claims"=${quote(JSON.stringify({sub:owner,role:"authenticated",session_id:owner}))};${statement};commit;`
      : statement
  ]).trim()
}
export async function setup() {
  const name = 'dailydeck-cloud-browser-' + Math.random().toString(16).slice(2)
  process.env.DAILY_DECK_CLOUD_TEST_CONTAINER = name
  docker([
    'run',
    '--detach',
    '--rm',
    '--name',
    name,
    '--network',
    'none',
    '--mount',
    `type=bind,src=${root}/supabase,dst=/spec,readonly`,
    '-e',
    'POSTGRES_HOST_AUTH_METHOD=trust',
    '-e',
    'POSTGRES_DB=dailydeck_test',
    image
  ])
  try {
    let ready = false
    for (let n = 0; n < 100; n++) {
      try {
        sql('select 1')
        ready = true
        break
      } catch {
        await new Promise((r) => setTimeout(r, 100))
      }
    }
    if (!ready) throw new Error('Local test PostgreSQL did not start')
    for (const path of [
      'tests/bootstrap.sql',
      ...readdirSync(root + '/supabase/migrations')
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .map((f) => 'migrations/' + f)
    ])
      docker([
        'exec',
        name,
        'psql',
        '-X',
        '-q',
        '--set',
        'ON_ERROR_STOP=1',
        '-U',
        'postgres',
        '-d',
        'dailydeck_test',
        '--file',
        '/spec/' + path
      ])
    return () => {
      docker(['stop', name])
    }
  } catch (e) {
    docker(['stop', name])
    throw e
  }
}
export default setup
export function reset() {
  sql(
    `delete from daily_deck_private.account_deletions;delete from storage.objects;delete from auth.users;update daily_deck_private.auth_configuration set mode='preview';insert into auth.users(id) values('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222');insert into auth.sessions(id,user_id) select id,id from auth.users;insert into public.daily_deck_profiles(owner_id,age_self_declared_at,preview_acknowledged_at,onboarding_kind) select id,now(),now(),'preview_test' from auth.users;set local "request.jwt.claims"='{"role":"service_role"}';select public.daily_deck_delete_queue();`
  )
}
