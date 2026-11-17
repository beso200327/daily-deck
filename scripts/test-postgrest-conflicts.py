#!/usr/bin/env python3
"""Real PostgREST retry regression. Disposable internal Docker network/DB only.

Never reads hosted credentials. Synthetic JWTs and roles exist only in this test.
A nontransactional sequence counts attempts even when RPC transactions roll back.
"""
import base64
import hashlib
import hmac
import http.client
import json
import subprocess
import time
import uuid
from pathlib import Path

from importlib.machinery import SourceFileLoader

base = SourceFileLoader('foundation', str(Path(__file__).with_name('test-supabase-foundation.py'))).load_module()
PGRST = 'postgrest/postgrest@sha256:d09618df2b7b9547c80a076c2f4045b326be8d7ac06060d263caefec1334e3c9'  # v13.0.8
name = 'dailydeck-retry-' + uuid.uuid4().hex[:10]
db, api, network = name + '-db', name + '-api', name + '-net'
A = '11111111-1111-1111-1111-111111111111'
B = '22222222-2222-2222-2222-222222222222'
secret = 'synthetic-disposable-jwt-secret-never-used-in-production'


def docker(*args):
    return subprocess.check_output([*base.DOCKER, *args], env=base.ENV, text=True).strip()


def sql(statement):
    return docker('exec', db, 'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'dailydeck_test', '-c', statement)


def apply(path):
    docker('exec', db, 'psql', '-Xq', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'dailydeck_test', '-f', '/spec/' + path)


def instrument():
    # Test-only instrumentation survives rolled-back exceptions; no production changes.
    sql("""do $test$ declare def text;begin
      select pg_get_functiondef('public.daily_deck_sync(uuid,text,uuid,bigint,jsonb,text)'::regprocedure) into def;
      execute replace(def, E'begin\n', E'begin\n perform nextval(''test_support.sync_attempts'');\n');
    end $test$; select setval('test_support.sync_attempts',1,false);""")


def attempts():
    return int(sql('select case when is_called then last_value else 0 end from test_support.sync_attempts'))


def start_api():
    docker('run', '-d', '--rm', '--name', api, '--network', network,
           '-p', '127.0.0.1::3000', '-e', f'PGRST_DB_URI=postgres://authenticator@{db}:5432/dailydeck_test',
           '-e', 'PGRST_DB_SCHEMAS=public', '-e', 'PGRST_DB_ANON_ROLE=anon',
           '-e', 'PGRST_DB_POOL=1', '-e', 'PGRST_DB_CHANNEL_ENABLED=false',
           '-e', f'PGRST_JWT_SECRET={secret}', PGRST)
    port = int(docker('port', api, '3000/tcp').rsplit(':', 1)[1])
    for _ in range(100):
        try:
            connection = http.client.HTTPConnection('127.0.0.1', port, timeout=1)
            connection.request('GET', '/')
            response = connection.getresponse()
            response.read()
            connection.close()
            if response.status == 200:
                return port
        except OSError:
            pass
        time.sleep(.1)
    raise RuntimeError('Disposable PostgREST failed readiness')


def token(owner):
    def encode(value):
        return base64.urlsafe_b64encode(json.dumps(value).encode()).rstrip(b'=')
    body = encode({'alg': 'HS256', 'typ': 'JWT'}) + b'.' + encode({'role': 'authenticated', 'sub': owner, 'exp': int(time.time()) + 600})
    return (body + b'.' + base64.urlsafe_b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).rstrip(b'=')).decode()


def request(port, payload, owner=A, timeout=5, endpoint='daily_deck_sync'):
    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=timeout)
    try:
        connection.request('POST', '/rpc/' + endpoint, json.dumps(payload), {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token(owner)})
        response = connection.getresponse()
        return response.status, json.loads(response.read())
    finally:
        connection.close()


if __name__ == '__main__':
    made_network = made_db = False
    try:
        docker('pull', base.IMAGE)
        docker('pull', PGRST)
        docker('network', 'create', '--internal', network)
        made_network = True
        docker('run', '-d', '--rm', '--name', db, '--network', network,
               '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=dailydeck_test',
               '--mount', f'type=bind,src={base.ROOT / "supabase"},dst=/spec,readonly', base.IMAGE)
        made_db = True
        for _ in range(120):
            try:
                sql('select 1')
                break
            except subprocess.CalledProcessError:
                time.sleep(.25)
        else:
            raise RuntimeError('Disposable database failed readiness')
        apply('tests/bootstrap.sql')
        migrations = sorted((base.ROOT / 'supabase/migrations').glob('*.sql'))
        fix = '20261116000600_sync_conflict_http_409.sql'
        for path in migrations:
            if path.name < fix:
                apply('migrations/' + path.name)
        sql(f"""create role authenticator login noinherit; grant anon,authenticated to authenticator;
            update daily_deck_private.auth_configuration set mode='preview';
            insert into auth.users(id) values('{A}'),('{B}');
            insert into public.daily_deck_profiles(owner_id,age_self_declared_at,preview_acknowledged_at,onboarding_kind) select id,now(),now(),'preview_test' from auth.users;
            insert into public.daily_deck_sync_heads(owner_id,revision) values('{A}',1);
            create sequence test_support.sync_attempts;""")
        instrument()
        port = start_api()
        stale = {'p_expected_user': A, 'p_operation': 'save', 'p_request_id': str(uuid.uuid4()), 'p_revision': 0, 'p_args': {'localDay': time.strftime('%Y-%m-%d'), 'task': {}}, 'p_timezone': 'UTC'}
        try:
            request(port, stale, timeout=2)
            raise AssertionError('Legacy 40001 unexpectedly completed instead of retrying')
        except TimeoutError:
            assert attempts() > 1, 'Single HTTP request must produce repeated SQL attempts'
            print(f'CONFIRMED: one HTTP request produced {attempts()} legacy SQL attempts before the client timed out', flush=True)
        before = attempts()
        time.sleep(.2)
        assert attempts() > before, 'Reproduction should continue after client disconnect'
        docker('rm', '-f', api)  # Stop ONLY our disposable retrying server.
        apply('migrations/' + fix)
        instrument()
        port = start_api()
        for _ in range(5):
            status, result = request(port, stale)
            assert status == 409 and result['code'] == 'PT409', (status, result)
        assert attempts() == 5, 'Each stale HTTP request must execute exactly once'
        assert sql('select count(*) from daily_deck_private.sync_receipts') == '0'
        assert sql(f"select revision from public.daily_deck_sync_heads where owner_id='{A}'") == '1'
        assert sql('select count(*) from public.daily_deck_items') == '0'
        status, result = request(port, stale, B)
        assert status == 403 and result['code'] == '42501', (status, result)
        print('PASS: repeated stale requests return HTTP 409 once each, no writes/receipts, account spoofing denied', flush=True)
    finally:
        subprocess.run([*base.DOCKER, 'rm', '-f', api], env=base.ENV, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if made_db:
            docker('rm', '-fv', db)
        if made_network:
            docker('network', 'rm', network)