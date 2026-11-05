// A production-mode build cannot enable these tools through a runtime flag or query string.
export const TEST_MODE=import.meta.env.DEV||(import.meta.env.MODE==='preview'&&import.meta.env.VITE_ENABLE_TEST_BILLING==='true')
const requested=TEST_MODE&&typeof location!=='undefined'?new URLSearchParams(location.search).get('sandbox'):null
export const SANDBOX=requested&&/^[a-zA-Z0-9-]{1,64}$/.test(requested)?requested:null
export const storageSuffix=SANDBOX?`.sandbox-${SANDBOX}`:''
