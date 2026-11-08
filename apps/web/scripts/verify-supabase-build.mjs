import {spawnSync} from 'node:child_process'
import {mkdtempSync,readdirSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
// A synthetic secret-shaped value, never a real credential.
const directory=mkdtempSync(join(tmpdir(),'dailydeck-rejected-config-'))
try{
 const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--outDir',directory],{encoding:'utf8',env:{...process.env,VITE_SUPABASE_URL:'https://foundation-fixture.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_secret_synthetic_rejected_fixture'}})
 if(result.error)throw result.error
 if(result.status===0||!result.stderr.includes('must be a public sb_publishable_ key')||readdirSync(directory).length)throw new Error('Privileged-key build did not fail safely before emitting assets')
 if((result.stdout+result.stderr).includes('sb_secret_synthetic_rejected_fixture'))throw new Error('Rejected key was echoed in build diagnostics')
 console.log('PASS: secret-shaped browser key rejected before asset emission; value never logged.')
}finally{rmSync(directory,{recursive:true,force:true})}
