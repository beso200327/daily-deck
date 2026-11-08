#!/usr/bin/env python3
"""Run SQL tests ONLY in a new network-isolated, disposable PostgreSQL container.
Never reads DATABASE_URL or Supabase credentials; never connects to a hosted DB.
Requires Docker and the pinned image (first run may download it).
"""
import os
from pathlib import Path
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
IMAGE = 'postgres@sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994'
NAME = 'dailydeck-foundation-test-' + uuid.uuid4().hex[:10]
ENV = {k: v for k, v in os.environ.items() if k not in {'DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'}}
DOCKER = ['docker','--host=unix:///var/run/docker.sock']

def run(*args, **kwargs):
    return subprocess.run([*DOCKER,*args], env=ENV, check=True, **kwargs)

if __name__ == '__main__':
    started = False
    try:
        run('info', '--format', '{{.ServerVersion}}')
        run('run','--detach','--rm','--name',NAME,'--network','none',
            '--env','POSTGRES_HOST_AUTH_METHOD=trust','--env','POSTGRES_DB=dailydeck_test',
            '--mount',f'type=bind,src={ROOT / "supabase"},dst=/spec,readonly',IMAGE)
        started = True
        for attempt in range(120):
            ready = subprocess.run([*DOCKER,'exec',NAME,'sh','-c','[ "$(cat /proc/1/comm)" = postgres ] && psql -X -qAt -U postgres -d dailydeck_test -c "select 1"'],env=ENV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            if ready.returncode == 0:
                break
            time.sleep(.25)
        else:
            raise RuntimeError('Isolated PostgreSQL failed to become ready within 30 seconds')
        files = ['tests/bootstrap.sql']
        for migration in sorted((ROOT/'supabase/migrations').glob('*.sql')):
            files.append(str(migration.relative_to(ROOT/'supabase')))
            if migration.name.startswith('20261108000100_'):
                files.extend(['verify-foundation.sql','tests/isolation.sql'])
            if migration.name.startswith('20261108000200_'):
                files.extend(['tests/auth-onboarding.sql','verify-auth.sql'])
        files.extend(['tests/cloud.sql','tests/cloud-regressions.sql','tests/cloud-import-security.sql','verify-cloud.sql'])
        for file in files:
            print(f'Applying in isolated container: {file}', flush=True)
            run('exec',NAME,'psql','-X','--set','ON_ERROR_STOP=1','-U','postgres','-d','dailydeck_test','--file',f'/spec/{file}')
        print('PASS: migration and authorization tests on isolated PostgreSQL; hosted Supabase was never contacted.')
    finally:
        if started:
            run('rm','--force','--volumes',NAME,stdout=subprocess.DEVNULL)
