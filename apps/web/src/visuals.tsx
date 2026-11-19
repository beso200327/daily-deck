import { useEffect, useLayoutEffect, useState } from 'react'
import type { Visual } from './deck'
import { getPhoto,photoScope } from './photos'
export function TaskVisual({icon = 'neutral', photoId, draft, small = false}: {icon?: Visual; photoId?: string; draft?: Blob; small?: boolean}) {
  const [source, setSource] = useState<{key: string | Blob; url: string} | null>(null)
  const [failed, setFailed] = useState(false)
  const [photoGeneration,setPhotoGeneration]=useState(0),scope=photoScope()
  useEffect(()=>{const update=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.owner&&scope===`.account-${detail.owner}`&&detail.id===photoId)setPhotoGeneration(n=>n+1)};window.addEventListener('daily-deck-cloud-photos',update);return()=>window.removeEventListener('daily-deck-cloud-photos',update)},[photoId,scope])
  useLayoutEffect(() => {
    let cancelled = false; let url: string | undefined
    setFailed(false)
    async function read() {
      try {
        const blob = draft ?? (photoId ? await getPhoto(photoId,scope) : undefined)
        if (cancelled || !blob) { if (!cancelled && photoId) setFailed(true); return }
        url = URL.createObjectURL(blob)
        setSource({key: draft ?? photoId!, url})
      } catch { if (!cancelled) setFailed(true) }
    }
    void read()
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [photoId, draft,scope,photoGeneration])
  const url = source?.key === (draft ?? photoId) ? source?.url : undefined
  const art = icon === 'water' ? 'drink-water' : icon
  return <div className={`task-visual visual-${icon} ${small ? 'small' : ''}`} data-visual={draft || photoId ? 'photo' : icon}>
    {url && !failed ? <img src={url} alt="Task photo" draggable={false} onError={() => setFailed(true)}/> : <>
      {icon === 'neutral'
        ? <div className="neutral-art" aria-hidden="true"><span><img src="/deck-art/nav-tasks.svg" alt="" width={64} height={64}/></span><i/><i/></div>
        : <img className="deck-illustration" src={`/deck-art/${art}.svg`} alt="" draggable={false}/>}
      {failed && <small className="photo-unavailable">Photo unavailable · choose a replacement in Edit</small>}
    </>}
  </div>
}
