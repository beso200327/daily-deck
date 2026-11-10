import {saveFailureMessage} from './cloud-api'
import { useEffect, useId, useRef, useState } from 'react'
import { Trash2, Upload, ImageMinus } from 'lucide-react'
import { Modal } from './Modal'
import { TaskVisual } from './visuals'
import { photoScope,preparePhoto, getPhotoEdit, putEditedPhoto, deletePhoto, type EditedPhoto, type PhotoEdit } from './photos'
import { ImageEditor } from './ImageEditor'
import * as D from './deck'
import {byTime,webReminderStatus} from './deadlines'
import {FREE} from './limits'
import {cloud,needsCloudRecovery} from './cloud-store'
import type { Task, Visual } from './deck'
const weekNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
export function Editor({task,habit,exists,close,save,remove,error,review,resolved,busy,usage,unlimited,onUpgrade,pendingDay}: {task: Task; habit: boolean; exists: boolean; close: () => void; save: (task: Task) => Promise<boolean>; remove: () => Promise<void>; error: string; review:()=>Promise<Task|undefined>; resolved:()=>void; busy: boolean;usage:{tasks:number;habits:number};unlimited:boolean;pendingDay?:D.Day;onUpgrade:(kind:'tasks'|'habits')=>void}) {
  const formId=useId()
  const [saveError,setSaveError]=useState(''),[saveNotice,setSaveNotice]=useState('')
  const [latest,setLatest]=useState<{task?:Task}|null>(null),[reviewing,setReviewing]=useState(false)
  const [copyText,setCopyText]=useState('')
  const saveFeedback=useRef<HTMLDivElement>(null)
  const issue=error||saveError
  async function copyDraft(){const text=[value.title,value.notes,kind==='habit'?'Recurring habit: '+value.weekdays.map(day=>weekNames[day]).join(', '):'Today only',deadline?'Complete by: '+deadline:'No deadline',deadline&&remind?'Reminder preference: 30 minutes before':''].filter(Boolean).join('\n\n');try{await navigator.clipboard.writeText(text);setSaveNotice('Draft copied. Your unsaved edits remain in this form.')}catch{setCopyText(text);setSaveNotice('Select and copy the draft below. Your edits remain in this form.')}}

  const [value, setValue] = useState(task)
  const [kind, setKind] = useState<'today' | 'habit'>(habit ? 'habit' : 'today')
  const [deadline,setDeadline]=useState(task.deadline??''),[remind,setRemind]=useState(!!task.remind)
  const [confirm, setConfirm] = useState(false)
  const [draft, setDraft] = useState<EditedPhoto>()
  const [adjusting, setAdjusting] = useState<PhotoEdit | null>(null)
  const [photoId, setPhotoId] = useState(task.photoId)
  const [photoNotice,setPhotoNotice]=useState(false)
  const [photoError, setPhotoError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(()=>{if((issue||saveNotice)&&!saving){saveFeedback.current?.scrollIntoView({block:'nearest'});saveFeedback.current?.focus({preventScroll:true})}},[issue,saveNotice,saving])
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
    savingRef.current = true; setSaving(true); resolved();setPhotoError('');setSaveError('');setSaveNotice('')
    const scope=photoScope()
    let newId: string | undefined
    try {
      if (draft) { newId = D.uid(); await putEditedPhoto(newId, draft,scope) }
      const success = await save({...value, kind, weekdays: recurring ? value.weekdays : [], deadline:deadline||undefined,remind:!!deadline&&remind, photoId: newId ?? photoId})
      if(!success)setSaveError('Save was not confirmed. Your edits are still here. Try again, or check the latest saved version before reopening the task.')
      if (!success && newId&&scope===''&&!cloud.holdsPhoto(newId,scope)) await deletePhoto(newId,scope).catch(() => {})
    } catch (e) { if (newId&&scope===''&&!cloud.holdsPhoto(newId,scope)) await deletePhoto(newId,scope).catch(() => {}); setSaveError(e instanceof Error ? e.message : 'Save failed. Your edits are still here. Try again.') }
    finally { savingRef.current = false; setSaving(false) }
  }
  const recoveryLocked=saving||processing||reviewing
  const locked = busy || recoveryLocked
  const quotaKind=recurring?'habits':'tasks',atLimit=usage[quotaKind]>=FREE[quotaKind]
  const deadlineDay=pendingDay??(recurring?Array.from({length:7},(_,i)=>D.addDays(D.dayKey(),i)).find(day=>value.weekdays.includes(D.dateOf(day).getDay()))??D.dayKey():task.created)
  return <><Modal title={`${exists ? 'Edit' : 'New'} ${recurring ? 'habit' : 'task'}`} close={() => {if (!saving) close()}} footer={<div className="form-actions">{!unlimited&&<div className="form-quota" aria-label="Selected type allowance"><p>{usage[quotaKind]} of {FREE[quotaKind]} {recurring?'habits':'active tasks'}</p>{!exists&&atLimit&&<div className="quota-limit"><p>{recurring?'Your free habit allowance is full. Upgrade to add another habit, or delete an active habit.':'Your free active-task allowance is full. Upgrade to add another task, or complete, skip, or delete an active task.'}</p><button type="button" className="text-button" disabled={locked} onClick={()=>onUpgrade(quotaKind)}>Upgrade</button></div>}</div>}<button type="button" className="secondary" disabled={saving} onClick={close}>Cancel</button><button type="submit" form={formId} className="primary" disabled={locked || !value.title.trim() || (recurring && !value.weekdays.length)}>{saving ? 'Saving…' : `Save ${recurring ? 'habit' : 'task'}`}</button></div>}>
    <form id={formId} onSubmit={e => {e.preventDefault(); void submit()}}>
      {(issue||saveNotice)&&<div className="editor-save-feedback" ref={saveFeedback} tabIndex={-1}><p className={issue?'field-error':''} role={issue?'alert':'status'}>{issue?`${issue} Your unsaved edits are still here.`:saveNotice}</p>{issue&&saveNotice&&<p role="status">{saveNotice}</p>}{issue&&<div className="photo-actions"><button type="button" className="text-button" disabled={recoveryLocked} onClick={()=>void copyDraft()}>Copy draft text</button>{cloud.snapshot().scope!=='local'&&<button type="button" className="text-button" disabled={recoveryLocked} onClick={async()=>{setReviewing(true);try{setLatest({task:await review()})}catch(e){setSaveNotice(e instanceof Error?e.message:'Could not read the saved version. Try again.')}finally{setReviewing(false)}}}>{reviewing?'Checking…':'Check latest saved version'}</button>}</div>}{copyText&&<label>Draft to copy<textarea readOnly value={copyText} onFocus={e=>e.target.select()}/></label>}</div>}
      <fieldset className="type-choice" disabled={exists || locked}><legend>What kind of little thing?</legend><div className="segmented"><button type="button" aria-pressed={!recurring} onClick={() => setKind('today')}>Today only</button><button type="button" aria-pressed={recurring} onClick={() => {setKind('habit'); if (!value.weekdays.length) setValue({...value, weekdays: [0,1,2,3,4,5,6]})}}>Recurring habit</button></div></fieldset>
      {exists && <p className="type-note">{recurring ? 'Recurring habit' : 'Today-only task'} · type stays fixed to protect history.</p>}
      <label>Title<input required maxLength={180} placeholder="One small thing…" value={value.title} onChange={e => setValue({...value,title:e.target.value})}/></label>
      <label>Notes <span className="optional">optional</span><textarea placeholder="A little encouragement, or a few details." maxLength={3000} rows={3} value={value.notes} onChange={e => setValue({...value,notes:e.target.value})}/></label>
      <fieldset className="deadline-picker"><legend>Complete by <span className="optional">optional</span></legend><div className="deadline-row"><label><span className="sr-only">Complete by</span><input type="time" value={deadline} onChange={e=>{setDeadline(e.target.value);if(!e.target.value)setRemind(false)}}/></label>{deadline&&<button type="button" className="text-button clear-deadline" onClick={()=>{setDeadline('');setRemind(false)}}>No deadline</button>}</div><p className="deadline-selection" aria-live="polite">{deadline?byTime(deadline):'No deadline selected.'}</p>{deadline&&<><label className="reminder-choice"><input type="checkbox" checked={remind} onChange={e=>setRemind(e.target.checked)}/>Remind me 30 minutes before</label><p className="footnote">Background reminders are unavailable in this web app. Enabling this saves a preference only; it does not schedule a notification or request permission. Native iPhone reminders use a separate local deck.</p>{remind&&<p className="reminder-status" role="status">{webReminderStatus({day:deadlineDay,deadline,remind},new Date(),false)}</p>}</>}</fieldset>
      <fieldset className="photo-picker"><legend>Make it yours <span className="optional">optional</span></legend>
        <TaskVisual icon={value.icon} photoId={photoId} draft={draft?.rendered}/>
        <label>Icon<select aria-label="Task icon" value={value.icon ?? 'neutral'} onChange={e => setValue({...value,icon:e.target.value as Visual})}>{Object.entries(D.visualNames).map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <input ref={input} aria-label="Choose task photo" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={e => void pick(e.target.files?.[0])} hidden tabIndex={-1}/>
        <div className="photo-actions"><button ref={photoButton} type="button" className="secondary" disabled={locked} onClick={()=>setPhotoNotice(true)}><Upload size={16}/>{processing ? 'Preparing photo…' : draft || photoId ? 'Replace photo' : 'Choose photo'}</button>{(draft || photoId) && <button type="button" className="secondary" disabled={locked} onClick={async () => {setPhotoError('');setProcessing(true);try{setAdjusting(draft ?? await getPhotoEdit(photoId!))}catch(e){setPhotoError(e instanceof Error ? e.message : 'Could not open this photo.')}finally{setProcessing(false)}}}>Adjust photo</button>}{(draft || photoId) && <button type="button" className="text-button" disabled={locked} onClick={() => {fileGeneration.current++; setDraft(undefined); setPhotoId(undefined); setPhotoError('')}}><ImageMinus size={16}/>Remove photo</button>}</div>
        <p className="photo-privacy">{cloud.snapshot().scope==='local'?'Only the photo you select is added. It stays on this device.':'Only the photo you select is added. Saving stores it privately online for this account.'}</p><p className="footnote">Photo library or files · JPEG, PNG, WebP, AVIF · up to 20 MB. Crop resized to 1200 px; source kept for re-editing.</p>
        {photoError && <p className="field-error" role="alert">{photoError}</p>}
      </fieldset>
      {recurring && <fieldset><legend>Make it a rhythm</legend><div className="schedule-choice"><button type="button" className="text-button" aria-pressed={value.weekdays.length === 7} onClick={() => setValue({...value,weekdays:[0,1,2,3,4,5,6]})}>Every day</button><span>or selected weekdays</span></div><div className="weekday-picker">{[1,2,3,4,5,6,0].map(d => <button type="button" key={d} aria-pressed={value.weekdays.includes(d)} onClick={() => setValue({...value,weekdays:value.weekdays.includes(d) ? value.weekdays.filter(n => n !== d) : [...value.weekdays,d]})}>{weekNames[d]}</button>)}</div>{!value.weekdays.length && <p className="field-error">Choose at least one weekday.</p>}{exists && <p className="footnote">Schedule and text edits apply from {D.prettyDay(D.editEffectiveFrom(task),{weekday:'long',month:'short',day:'numeric'})}{D.editEffectiveFrom(task)===D.addDays(D.dayKey(),1)?' (tomorrow)':''}. Deadline/reminder changes apply immediately to unfinished occurrences from today onward; past and finished records stay unchanged. Photos and icons update today’s pending card; past dates keep their visuals.{D.editEffectiveFrom(task)>D.addDays(D.dayKey(),1)&&' A later local date was already visited on this device, so those saved dates also stay unchanged.'}</p>}</fieldset>}
      {needsCloudRecovery(cloud.snapshot())&&<button type="button" className="secondary" disabled={saving||processing||cloud.snapshot().phase==='saving'} onClick={async()=>{setSaving(true);try{await cloud.retry();resolved();setSaveError('');setSaveNotice('The original save was confirmed. Close this form and reopen the saved task before making further edits.')}catch(e){resolved();setSaveNotice('');setSaveError(saveFailureMessage(e))}finally{setSaving(false)}}}>Retry pending cloud save</button>}

      {exists && <div className="delete-section"><button type="button" disabled={locked} className="text-button danger" onClick={() => setConfirm(true)}><Trash2 size={15}/>Delete {recurring ? 'habit' : 'task'}</button></div>}
    </form>
  </Modal>{latest&&<Modal title="Latest saved version" close={()=>setLatest(null)} initialFocus="heading"><p>Your draft is unchanged. Copy it before cancelling; reopen the task to edit from the latest revision.</p>{latest.task?<><h3 className="task-details-title">{latest.task.title}</h3><p className="task-details-notes">{latest.task.notes||'No notes added.'}</p>{latest.task.archived&&<p>This task was deleted.</p>}</>:<p>This task is no longer available.</p>}<button type="button" className="secondary" onClick={()=>setLatest(null)}>Back to my draft</button></Modal>}{confirm && <Modal title={recurring ? 'Delete habit?' : 'Delete task?'} initialFocus="heading" close={()=>{if(!locked)setConfirm(false)}}><div className="delete-confirm"><p>{recurring ? 'This removes the habit and its unfinished tasks from today and future days. Your history stays.' : 'This removes the unfinished task. Its history stays marked deleted.'}</p>{needsCloudRecovery(cloud.snapshot())&&<button type="button" className="secondary" disabled={saving||processing||cloud.snapshot().phase==='saving'} onClick={async()=>{setSaving(true);try{await cloud.retry();close()}catch(e){resolved();setSaveNotice('');setSaveError(saveFailureMessage(e))}finally{setSaving(false)}}}>Retry pending cloud save</button>}{error && <p role="alert" className="field-error">{error} {cloud.snapshot().scope!=='local'&&cloud.snapshot().pending?'The outcome is not confirmed. Retry the original save before making another change.':'Nothing was deleted. Try again, or cancel and check browser storage.'}</p>}<div className="form-actions"><button type="button" className="secondary" disabled={locked} onClick={()=>setConfirm(false)}>Cancel</button><button type="button" className="primary danger" disabled={locked} onClick={()=>{if(savingRef.current||busy)return;savingRef.current=true;setSaving(true);void remove().finally(()=>{savingRef.current=false;setSaving(false)})}}>{saving ? 'Deleting…' : `Delete ${recurring ? 'habit' : 'task'}`}</button></div></div></Modal>}{adjusting && <ImageEditor photo={adjusting} cancel={closeAdjusting} chooseAnother={()=>setPhotoNotice(true)} externalError={photoError} use={photo => {setDraft(photo);setPhotoId(undefined);closeAdjusting()}}/>}{photoNotice&&<Modal title="Choose a task photo" close={()=>setPhotoNotice(false)} initialFocus="heading"><p>Choose a photo to add to this task. The app receives only the photo you select.</p><p>This is information about the picker, not a system permission grant. Only the selected file is processed locally. In cloud mode, saving uploads its original and crop to your private account storage.</p><div className="form-actions"><button type="button" className="secondary" onClick={()=>setPhotoNotice(false)}>Cancel</button><button type="button" className="primary" onClick={()=>{setPhotoNotice(false);(document.activeElement as HTMLElement|null)?.blur();input.current?.click()}}>Continue</button></div></Modal>}</>
}
