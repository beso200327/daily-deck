import { useEffect, useLayoutEffect, useState } from 'react'
import { BookOpen, Droplets, Footprints, Leaf, CircleDot, Layers } from 'lucide-react'
import type { Visual } from './deck'
import { getPhoto,photoScope } from './photos'
export const visualIcons = {neutral: Layers, walk: Footprints, read: BookOpen, water: Droplets, focus: CircleDot, stretch: Leaf}
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
  const Icon = visualIcons[icon]
  return <div className={`task-visual visual-${icon} ${small ? 'small' : ''}`} data-visual={draft || photoId ? 'photo' : icon}>
    {url && !failed ? <img src={url} alt="Task photo" draggable={false} onError={() => setFailed(true)}/> : <>
      {icon === 'walk' ? <WalkingArt/> : icon === 'read' ? <ReadingArt/> : icon === 'water' ? <WaterArt/> : <div className="neutral-art"><span><Icon size={64} strokeWidth={1.3}/></span><i/><i/></div>}
      {failed && <small className="photo-unavailable">Photo unavailable · choose a replacement in Edit</small>}
    </>}
  </div>
}
function ReadingArt() { return <svg viewBox="0 0 320 220" aria-hidden="true"><ellipse cx="160" cy="202" rx="108" ry="5" fill="#e7e3ce"/><circle cx="166" cy="103" r="77" fill="#eff0d6"/><path d="M64 84q48-21 96 3 48-24 96-3v103q-48-21-96 1-48-22-96-1Z" fill="#b4bc78"/><path d="M69 74q47-19 91 6 46-25 91-6v103q-44-19-91 5-44-24-91-5Z" fill="#fff9e8" stroke="#aaa475" strokeWidth="2"/><path d="M160 80v101M88 98q28-6 53 6m-53 12q28-6 53 6m-53 12q28-6 53 6m39-36q28-12 52-6m-52 24q28-12 52-6m-52 24q28-12 52-6" fill="none" stroke="#c9c5a4" strokeWidth="3" strokeLinecap="round"/><path d="m205 74 1 45 10-8 9 5V72" fill="#e8b59a"/><path d="m56 168-12-25m8 8-11 1m171-112 5-13m6 21 11-4" stroke="#9da85d" strokeWidth="3" strokeLinecap="round"/></svg> }
function WaterArt() { return <svg viewBox="0 0 320 220" aria-hidden="true"><ellipse cx="160" cy="202" rx="90" ry="5" fill="#e7e3ce"/><circle cx="157" cy="109" r="78" fill="#e7eee5"/><path d="m115 62 12 124q32 13 64 0l13-124" fill="#fbfaf0" stroke="#91a9a1" strokeWidth="3"/><ellipse cx="160" cy="62" rx="44" ry="10" fill="#f4f7ef" stroke="#91a9a1" strokeWidth="3"/><path d="m122 118 7 65q31 12 60 0l7-65q-22 9-38-1-21-8-36 1" fill="#b9d3c7"/><path d="m139 84 4 65" stroke="#fff" strokeWidth="6" strokeLinecap="round"/><path d="M218 48q-23 30 0 32 23-2 0-32" fill="#97b9ac"/><path d="m88 102-13-5m17-7-6-13m139 87 12-6" stroke="#a9b66c" strokeWidth="3" strokeLinecap="round"/></svg> }
function WalkingArt() { return <svg className="walk-art" viewBox="0 0 320 220" aria-hidden="true">
  <ellipse cx="161" cy="204" rx="116" ry="5" fill="#e7e3ce"/>
  <g fill="#aab56a"><path d="M45 196C17 184 17 160 29 158c9-2 13 17 17 24-20-42-3-58 7-45 8 11 4 27 3 41 9-25 28-29 28-16 0 13-16 22-27 34Z"/><path d="M255 198c-24-10-31-26-22-30 8-3 13 10 18 17-9-31 2-49 11-41 8 9 0 28-3 39 14-23 29-20 25-8-3 11-16 16-29 23Z"/></g>
  <path d="m153 123-6 38-40 35 10 7 47-33 13-41" fill="#37392e"/><path d="m167 125 22 40 30 27-8 9-39-30-29-36" fill="#454637"/>
  <path d="m109 193-15 6q-6 5 2 9l28-2-7-10m96-7 9 4 9 13q2 7-5 5l-18-12" fill="#f8f6e9" stroke="#a6a18a" strokeWidth="1.5"/>
  <path d="M147 69q-20 9-23 53l26 12 29-8-10-48Z" fill="#e9e7ce"/>
  <path d="M140 79q-20-7-27 12l-7 34 26 7 12-36" fill="#afb968" stroke="#788246"/>
  <path d="m166 86 16 31 26 14" stroke="#f0ba95" strokeWidth="9" fill="none" strokeLinecap="round"/>
  <path d="m164 84 14 26" stroke="#eeedd8" strokeWidth="16" fill="none" strokeLinecap="round"/>
  <path d="m151 68 4-12 16 6-5 17" fill="#eab38a"/>
  <ellipse cx="166" cy="48" rx="16" ry="21" fill="#f0ba95" transform="rotate(14 166 48)"/>
  <path d="M177 34q-13-16-28-3c-12 5-12 25-5 31l15-12q-2-15 18-16" fill="#4e382a"/>
  <path d="M149 34q-9-14-19-5c-4 7-11 3-15 11-7 14 15 18 21 4" fill="#4e382a"/>
  <path d="m180 44 4 6-7 2m-5 8 5-1" fill="none" stroke="#975d43" strokeLinecap="round"/>
  <g stroke="#a5ae55" strokeWidth="2.5" strokeLinecap="round"><path d="m200 34 4-11m6 19 9-7m-4 17 10-1"/></g>
</svg> }
