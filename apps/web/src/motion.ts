// Shared action clock: one persisted reorder drives the deck and the compact queue.
export const LATER_OUT_MS=230
export const LATER_RETURN_MS=480
export const QUEUE_SETTLE_MS=90
export const REDUCED_PHASE_MS=90
export function phaseDuration(action:'done'|'later'|'skip',phase:'out'|'return',reduced=false){return reduced?REDUCED_PHASE_MS:action==='later'?(phase==='out'?LATER_OUT_MS:LATER_RETURN_MS):320}
