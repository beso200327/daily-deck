import { useRef, useState } from 'react'
import { Trash2, Upload, ImageMinus } from 'lucide-react'
import { Modal } from './Modal'
import { TaskVisual } from './visuals'
import { preparePhoto, getPhotoEdit, putEditedPhoto, deletePhoto, type EditedPhoto, type PhotoEdit } from './photos'
import { ImageEditor } from './ImageEditor'
import * as D from './deck'
import type { Task, Visual } from './deck'
const weekNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
export function Editor({task,habit,exists,close,save,remove,error,busy}: {task: Task; habit: boolean; exists: boolean; close: () => void; save: (task: Task) => Promise<boolean>; remove: () => Promise<void>; error: string; busy: boolean}) {
  const [value, setValue] = useState(task)
  const [kind, setKind] = useState<'today' | 'habit'>(habit ? 'habit' : 'today')
  const [minutes, setMinutes] = useState(task.minutes?.toString() ?? '')
  const [confirm, setConfirm] = useState(false)
  const [draft, setDraft] = useState<EditedPhoto>()
  const [adjusting, setAdjusting] = useState<PhotoEdit | null>(null)
  const [photoId, setPhotoId] = useState(task.photoId)
  const [photoError, setPhotoError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const fileGeneration = useRef(0)
  const photoButton = useRef<HTMLButtonElement>(null)
  function closeAdjusting(){setAdjusting(null);requestAnimationFrame(()=>photoButton.current?.focus({preventScroll:true}))}
  const recurring = kind === 'habit'
  async function pick(file?: File) {
    if (!file) return
    const generation = ++fileGeneration.current
    setProcessing(true); setPhotoError('')
    try { const photo = await preparePhoto(file); if (generation === fileGeneration.current) setAdjusting(photo) }
    catch (e) { if (generation === fileGeneration.current) setPhotoError(e instanceof Error ? e.message : 'Could not open this photo.') }
    finally { if (generation === fileGeneration.current) setProcessing(false); if (input.current) input.current.value = '' }
  }
  async function submit() {
    if (savingRef.current || processing || busy) return
    savingRef.current = true; setSaving(true); setPhotoError('')
    let newId: string | undefined
    try {
      if (draft) { newId = D.uid(); await putEditedPhoto(newId, draft) }
      const success = await save({...value, kind, weekdays: recurring ? value.weekdays : [], minutes: minutes ? Number(minutes) : null, photoId: newId ?? photoId})
      if (!success && newId) await deletePhoto(newId).catch(() => {})
    } catch (e) { if (newId) await deletePhoto(newId).catch(() => {}); setPhotoError(e instanceof Error ? e.message : 'Could not save this photo. Your previous task is unchanged.') }
    finally { savingRef.current = false; setSaving(false) }
  }
  const locked = busy || saving || processing
  return <><Modal title={`${exists ? 'Edit' : 'New'} ${recurring ? 'habit' : 'task'}`} close={() => {if (!saving) close()}}>
    <form onSubmit={e => {e.preventDefault(); void submit()}}>
      <fieldset className="type-choice" disabled={exists || locked}><legend>What kind of little thing?</legend><div className="segmented"><button type="button" aria-pressed={!recurring} onClick={() => setKind('today')}>Today only</button><button type="button" aria-pressed={recurring} onClick={() => {setKind('habit'); if (!value.weekdays.length) setValue({...value, weekdays: [0,1,2,3,4,5,6]})}}>Recurring habit</button></div></fieldset>
      {exists && <p className="type-note">{recurring ? 'Recurring habit' : 'Today-only task'} · type stays fixed to protect history.</p>}
      <label>Title<input required maxLength={180} placeholder="One small thing…" value={value.title} onChange={e => setValue({...value,title:e.target.value})}/></label>
      <label>Notes <span className="optional">optional</span><textarea placeholder="A little encouragement, or a few details." maxLength={3000} rows={3} value={value.notes} onChange={e => setValue({...value,notes:e.target.value})}/></label>
      <label>Estimated minutes <span className="optional">optional</span><input type="number" min={1} max={1440} step={1} placeholder="20" value={minutes} onChange={e => setMinutes(e.target.value)}/></label>
      <fieldset className="photo-picker"><legend>Make it yours <span className="optional">optional</span></legend>
        <TaskVisual icon={value.icon} photoId={photoId} draft={draft?.rendered}/>
        <label>Icon<select aria-label="Task icon" value={value.icon ?? 'neutral'} onChange={e => setValue({...value,icon:e.target.value as Visual})}>{Object.entries(D.visualNames).map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <input ref={input} aria-label="Choose task photo" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={e => void pick(e.target.files?.[0])} className="sr-only" tabIndex={-1}/>
        <div className="photo-actions"><button ref={photoButton} type="button" className="secondary" disabled={locked} onClick={() => { (document.activeElement as HTMLElement | null)?.blur(); input.current?.click() }}><Upload size={16}/>{processing ? 'Preparing photo…' : draft || photoId ? 'Replace photo' : 'Choose photo'}</button>{(draft || photoId) && <button type="button" className="secondary" disabled={locked} onClick={async () => {setPhotoError('');setProcessing(true);try{setAdjusting(draft ?? await getPhotoEdit(photoId!))}catch(e){setPhotoError(e instanceof Error ? e.message : 'Could not open this photo.')}finally{setProcessing(false)}}}>Adjust photo</button>}{(draft || photoId) && <button type="button" className="text-button" disabled={locked} onClick={() => {fileGeneration.current++; setDraft(undefined); setPhotoId(undefined); setPhotoError('')}}><ImageMinus size={16}/>Remove photo</button>}</div>
        <p className="photo-privacy">Only the photo you select is added. It stays on this device.</p><p className="footnote">Photo library or files · JPEG, PNG, WebP, AVIF · up to 20 MB. Crop resized to 1200 px; source kept locally for re-editing.</p>
        {photoError && <p className="field-error" role="alert">{photoError}</p>}
      </fieldset>
      {recurring && <fieldset><legend>Make it a rhythm</legend><div className="schedule-choice"><button type="button" className="text-button" aria-pressed={value.weekdays.length === 7} onClick={() => setValue({...value,weekdays:[0,1,2,3,4,5,6]})}>Every day</button><span>or selected weekdays</span></div><div className="weekday-picker">{[1,2,3,4,5,6,0].map(d => <button type="button" key={d} aria-pressed={value.weekdays.includes(d)} onClick={() => setValue({...value,weekdays:value.weekdays.includes(d) ? value.weekdays.filter(n => n !== d) : [...value.weekdays,d]})}>{weekNames[d]}</button>)}</div>{!value.weekdays.length && <p className="field-error">Choose at least one weekday.</p>}{exists && <p className="footnote">Schedule and text edits apply tomorrow. Photos and icons update today’s pending card; past dates keep their visuals.</p>}</fieldset>}
      {error && <p className="field-error" role="alert">{error} Your edits are still here.</p>}
      <div className="form-actions"><button type="button" className="secondary" disabled={saving} onClick={close}>Cancel</button><button className="primary" disabled={locked || !value.title.trim() || (recurring && !value.weekdays.length)}>{saving ? 'Saving…' : `Save ${recurring ? 'habit' : 'task'}`}</button></div>
      {exists && <div className="delete-section">{confirm ? <><p>{recurring ? 'Stop future occurrences? Today’s card and all history remain.' : 'Remove this task from the deck? Its history remains marked deleted.'}</p><button type="button" className="danger" disabled={locked} onClick={() => void remove()}>Confirm delete</button><button type="button" className="text-button" onClick={() => setConfirm(false)}>Keep it</button></> : <button type="button" className="text-button danger" onClick={() => setConfirm(true)}><Trash2 size={15}/>Delete {recurring ? 'habit' : 'task'}</button>}</div>}
    </form>
  </Modal>{adjusting && <ImageEditor photo={adjusting} cancel={closeAdjusting} use={photo => {setDraft(photo);setPhotoId(undefined);closeAdjusting()}}/>}</>
}
