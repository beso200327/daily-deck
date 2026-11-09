export const accountEvents=new EventTarget()
export function accountUnavailable(owner:string,state:'invalid'|'deleting'|'deleted'){accountEvents.dispatchEvent(new CustomEvent('unavailable',{detail:{owner,state}}))}
