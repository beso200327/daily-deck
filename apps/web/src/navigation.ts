import {useEffect,useState} from 'react'
import {SANDBOX} from './environment'
export const pages=['Today','Habits','Progress'] as const
export function pageFromURL(url:Pick<URL,'pathname'|'hash'|'search'>):string {
 const query=new URLSearchParams(url.search)
 if(url.pathname!=='/'||[...query.keys()].some(k=>k!=='sandbox')||(query.has('sandbox')&&query.get('sandbox')!==SANDBOX))return 'Today'
 return pages.find(p=>url.hash==='#'+p.toLowerCase())??'Today'
}
export function usePage(){
 const [page,setPage]=useState(()=>pageFromURL(new URL(location.href)))
 const path=(p:string)=>'/'+(SANDBOX?'?sandbox='+SANDBOX:'')+'#'+p.toLowerCase()
 useEffect(()=>{const restore=()=>{const p=pageFromURL(new URL(location.href));if(location.pathname+location.search+location.hash!==path(p))history.replaceState(null,'',path(p));setPage(p)};restore();window.addEventListener('popstate',restore);window.addEventListener('hashchange',restore);return()=>{window.removeEventListener('popstate',restore);window.removeEventListener('hashchange',restore)}},[])
 return [page,(value:string)=>{const p=pages.find(p=>p===value)??'Today';if(location.pathname+location.search+location.hash!==path(p))history.pushState(null,'',path(p));setPage(p)}] as const
}
