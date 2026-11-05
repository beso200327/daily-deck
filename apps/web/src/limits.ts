import {isHabit,terminal,type Deck} from './deck'
import {TEST_MODE,storageSuffix} from './environment'
export const FREE={tasks:10,habits:5}
export function usage(deck:Deck){return{tasks:deck.tasks.filter(t=>!t.archived&&!isHabit(t)&&(!deck.cards.some(c=>c.taskId===t.id)||deck.cards.some(c=>c.taskId===t.id&&!terminal(c)))).length,habits:deck.tasks.filter(t=>!t.archived&&isHabit(t)).length}}
export class LimitError extends Error{constructor(public kind:'tasks'|'habits'){super(`The free plan allows ${FREE[kind]} active ${kind}. Your existing records and draft are preserved.`)}}
export function checkCapacity(before:Deck,after:Deck,pro=false){if(pro)return;const a=usage(before),b=usage(after);for(const kind of ['tasks','habits'] as const)if(b[kind]>FREE[kind]&&b[kind]>a[kind])throw new LimitError(kind)}
const KEY=`daily-deck.preview-entitlement.v1${storageSuffix}`
export function isPro(){if(!TEST_MODE)return false;try{const state=JSON.parse(localStorage.getItem(KEY)??'null');return state?.plan==='pro'&&Number.isFinite(state.expiresAt)&&state.expiresAt>Date.now()}catch{return false}}
export function assertCapacity(before:Deck,after:Deck){checkCapacity(before,after,isPro())}
export function setTestPlan(plan:'free'|'pro',expiresAt=Date.now()+30*86400_000){if(!TEST_MODE)throw new Error('Test billing is unavailable in production.');localStorage.setItem(KEY,JSON.stringify({plan,expiresAt}));window.dispatchEvent(new Event('daily-deck-entitlement'))}
