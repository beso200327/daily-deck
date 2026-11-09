// Noncredential intent only. Fresh authentication is still verified server-side.
export const reauthIntentKey='daily-deck.auth.delete-reauth.v1'
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>
export function verificationIntent(store:Store|undefined,now=Date.now()):{owner:string;expires:number}|null{
 try{const value=JSON.parse(store?.getItem(reauthIntentKey)??'null');return /^[a-f0-9-]{36}$/i.test(value?.owner??'')&&typeof value.expires==='number'&&value.expires>now?value:null}catch{return null}
}
export function rememberVerification(owner:string,store:Store|undefined){
 if(!store)throw new Error('This browser cannot retain the intended account for verification. Use password verification instead.')
 const intent=verificationIntent(store);if(intent&&intent.owner!==owner)throw new Error('A different account was intended for verification. Cancel the verification request before starting another one.')
 store.setItem(reauthIntentKey,JSON.stringify({owner,expires:Date.now()+10*60_000}))
}
export function cancelVerification(){try{sessionStorage.removeItem(reauthIntentKey)}catch{/* No operation can be authorized by this marker. */}}
