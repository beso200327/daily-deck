import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { House, Layers, BarChart3, Plus, X, Check, RotateCcw, Clock3, ArrowUp, ArrowDown, Pencil, Trash2, ChevronLeft, ChevronRight, Leaf, ArrowUpRight, CalendarDays } from 'lucide-react'
import * as D from './deck'
import type { Card, Deck, Task, Period } from './deck'
import './styles.css'
import { Modal } from './Modal'
import {Notifications} from './Notifications'
import {SupabaseConnection} from './SupabaseConnection'
import {AccountSection,AuthDialog,useAuth} from './Auth'
import {auth} from './auth-store'
import { Editor } from './Editor'
import { TaskDeck, type Exit } from './TaskDeck'
import { TaskVisual } from './visuals'
import { PwaControls } from './Pwa'
import { Toast, type ToastMessage } from './Toast'
import { DataControls } from './DataControls'
import {DeadlineLabel} from './DeadlineLabel'
import {byTime,webReminderStatus} from './deadlines'
import {TodayMenu} from './TodayMenu'
import {useViewport} from './viewport'
import { DeckQueue } from './DeckQueue'
import {phaseDuration} from './motion'
import {watchLocalCalendar} from './calendar'
import {transactDeck,type DeckSnapshot} from './store'
import {isPro,usage,LimitError,FREE} from './limits'
import {TEST_MODE} from './environment'
const PreviewTools=TEST_MODE?React.lazy(()=>import('./PreviewTools')):null
if(TEST_MODE){const {bootstrapFixture}=await import('./preview-fixture');bootstrapFixture()}

const newTask = (habit: boolean): Task => ({ id: D.uid(), kind: habit ? 'habit' : 'today', icon: 'neutral', title: '', notes: '', minutes: null, weekdays: habit ? [0,1,2,3,4,5,6] : [], created: D.dayKey(), archived: false })
const weekNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const errorText = (e: unknown) => e instanceof Error ? e.message : 'Your deck could not be saved. Check browser storage permissions and try again.'
function App() {
  const account=useAuth()
  const view=useViewport()
  const [menuOpen,setMenuOpen]=useState(false)
  const [taskDetails,setTaskDetails]=useState<Card|null>(null)
  const [settingsTarget,setSettingsTarget]=useState<HTMLDivElement|null>(null)
  const [upgrade,setUpgrade]=useState<LimitError|null>(null)
  const [pro,setPro]=useState(isPro)
  const [announcement,setAnnouncement]=useState('')
  const [announcementSequence,setAnnouncementSequence]=useState(0)
  const [createdCard,setCreatedCard]=useState<string|null>(null)
  useEffect(()=>{if(!createdCard)return;const t=setTimeout(()=>setCreatedCard(null),1600);return()=>clearTimeout(t)},[createdCard])
  useEffect(()=>{if(!createdCard||editor)return;let b=0;const a=requestAnimationFrame(()=>{b=requestAnimationFrame(()=>{if(matchMedia('(max-width:700px)').matches){const card=document.querySelector<HTMLElement>('[data-testid=active-card]');if(card?.dataset.cardId===createdCard){const r=card.getBoundingClientRect();if(r.top<0||r.bottom>innerHeight-90)card.closest('.deck-section')?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'})}}})});return()=>{cancelAnimationFrame(a);cancelAnimationFrame(b)}},[createdCard])
  useEffect(()=>{if(!TEST_MODE)return;const update=()=>setPro(isPro());window.addEventListener('daily-deck-entitlement',update);window.addEventListener('storage',update);const t=setInterval(update,1000);return()=>{clearInterval(t);window.removeEventListener('daily-deck-entitlement',update);window.removeEventListener('storage',update)}},[])
  const [deck, setDeck] = useState<Deck | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('Today')
  const [today, setToday] = useState(D.dayKey())
  const [editor, setEditor] = useState<Task | null>(null)
  const [editingHabit, setEditingHabit] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [info, setInfo] = useState(false)
  const [detail, setDetail] = useState<Card | null>(null)
  const [detailDay, setDetailDay] = useState(D.dayKey())
  const [managing, setManaging] = useState(false)
  const [writing, setWriting] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [exit, setExit] = useState<Exit | null>(null)
  const actionLock = useRef(false)
  const busy = writing || animating
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const navigationEpoch = useRef(0)
  const exitWait = useRef<{id:string;phase:Exit['phase'];done:()=>void}|null>(null)
  useEffect(() => {navigationEpoch.current++;setToast(null)}, [tab])
  const modalOpen = !!(editor || reordering || managing || detail || info || upgrade || taskDetails || account.open)
  useEffect(() => {if(modalOpen)setToast(null)},[modalOpen])
  const busyRef = useRef(false)
  const appliedSequence=useRef(0),refreshing=useRef(false),refreshPending=useRef(false),mounted=useRef(true)
  function apply(snapshot:DeckSnapshot){if(!mounted.current||snapshot.sequence<appliedSequence.current)return;appliedSequence.current=snapshot.sequence;setDeck(snapshot.deck);setToday(snapshot.day);setError('')}
  const refresh=()=>{
    if(actionLock.current||busyRef.current||refreshing.current){refreshPending.current=true;return}
    refreshing.current=true
    void transactDeck().then(apply).catch(e=>{if(mounted.current)setError(errorText(e))}).finally(()=>{refreshing.current=false;if(refreshPending.current&&!actionLock.current&&!busyRef.current){refreshPending.current=false;refresh()}})
  }
  useEffect(()=>{mounted.current=true;const stop=watchLocalCalendar(refresh);return()=>{mounted.current=false;stop()}},[])
  async function commit(change: (next: Deck, now:Date) => void, message?: string, undoable = false, silent = false) {
    if (busyRef.current) return false
    busyRef.current = true; setWriting(true)
    const epoch = navigationEpoch.current
    let undoId: string | undefined
    try {
      const snapshot=await transactDeck(change);undoId=undoable?D.undoToken(snapshot.deck,snapshot.day):undefined;apply(snapshot)
      if(message&&epoch===navigationEpoch.current){setAnnouncement(message);setToast(silent?null:{id:D.uid(),message,undoId})}
      return true
    } catch(e){if(e instanceof LimitError)setUpgrade(e);else setError(errorText(e));return false}
    finally {busyRef.current=false;setWriting(false);if(refreshPending.current&&!actionLock.current){refreshPending.current=false;refresh()}}
  }
  const add = (habit: boolean) => { setEditingHabit(habit); setEditor(newTask(habit)) }
  const edit = (task: Task) => { setEditingHabit(!!task.weekdays.length); setEditor(structuredClone(task)) }
  const cards = deck ? D.pending(deck, today) : []
  const planUsage=deck?usage(deck):{tasks:0,habits:0}
  const counts = deck ? D.summarize(deck, today) : null
  const token = deck ? D.undoToken(deck, today) : undefined
  function transition(next: Exit, reduced: boolean) {
    return new Promise<void>(resolve => {
      const timer = setTimeout(done,reduced?phaseDuration(next.action,next.phase,true):phaseDuration(next.action,next.phase)+180)
      function done() {clearTimeout(timer); if (exitWait.current?.done === done) exitWait.current=null; resolve()}
      exitWait.current={id:next.id,phase:next.phase,done}
      setExit(next)
    })
  }
  const action = async (type:'done'|'later'|'skip',card:Card,preview=false) => {
    if(actionLock.current || busyRef.current || (document.querySelector('dialog[open]')&&!preview)) return
    actionLock.current=true;setAnimating(true)
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches
    const node=document.querySelector<HTMLElement>('[data-testid=active-card]')
    const base={id:card.id,card,action:type,single:cards.length===1,fromTransform:node?getComputedStyle(node).transform:'none'}
    const actionEpoch=navigationEpoch.current
    try {
      await transition({...base,phase:'out'},reduced)
      const success=await commit((next,now)=>{
        if(D.pending(next,D.dayKey(now))[0]?.id!==card.id)throw new Error('This card changed in another tab or a new day began. Refresh your deck.')
        D.act(next,card.id,type,now)
      },actionEpoch===navigationEpoch.current?(type==='done'?`Completed: ${card.title}`:type==='later'?`Moved to the end: ${card.title}`:`Skipped today: ${card.title}`):undefined,true,type!=='skip')
      if(type==='later'||!success) await transition({...base,phase:'return'},reduced)
      setExit(null)
    } finally {setExit(null);actionLock.current=false;setAnimating(false);if(D.dayKey()!==today||refreshPending.current){refreshPending.current=false;refresh()}}
  }
  useEffect(()=>()=>exitWait.current?.done(),[])
  return <div className={`app-shell ${tab==='Today'?'is-today':''} ${view.relaxed?'relaxed-view':''}`} style={{'--viewport-height':`${view.height}px`} as React.CSSProperties}>
    <aside className="navigation"><a className="brand" href="#today" onClick={e => { e.preventDefault(); setTab('Today') }} aria-label="Daily Deck home"><span className="brand-symbol"><Layers size={23}/></span><span>daily deck<span className="brand-dot">.</span></span></a><p className="brand-promise">One thing at a time.</p>
      <nav aria-label="Main navigation">{[House, Layers, BarChart3].map((Icon, i) => { const name = ['Today','Habits','Progress'][i]; return <button type="button" key={name} aria-label={name} className={`nav-item ${tab === name ? 'selected' : ''}`} aria-current={tab === name ? 'page' : undefined} onClick={() => setTab(name)}><Icon size={21}/><span>{name}</span>{name === 'Today' && <span className="nav-count">{cards.length}</span>}</button> })}</nav>
      <div className="nav-bottom"><div className="little-leaf"><Leaf size={26}/></div><p>A little less rush.<br/>A little more rhythm.</p><button type="button" onClick={() => setInfo(true)} className="text-button">About your local deck <ArrowUpRight size={14}/></button></div>
    </aside>
    <main className="main-content" id="main"><header className="page-header"><div><p className="eyebrow">YOUR SPACE TO MAKE SPACE</p><h1>{tab === 'Today' ? 'Today' : tab === 'Habits' ? 'Your habits' : 'Your rhythm'}<span className="heading-dot">.</span></h1><p className="subtitle">{tab === 'Today' ? D.prettyDay(today, { weekday: 'long', month: 'long', day: 'numeric' }) : tab === 'Habits' ? 'Small rituals. A little better, every day.' : 'Small steps add up. See how far you’ve come.'}</p></div><div className="header-actions">{<TodayMenu changed={open=>{setMenuOpen(open);if(open)setToast(null)}}>{tab==='Today'&&<><button type="button" disabled={busy||!cards[0]} onClick={()=>cards[0]&&void action('skip',cards[0])}>Skip today</button><button type="button" disabled={busy||!cards.length} onClick={()=>setReordering(true)}>Reorder deck</button><button type="button" disabled={busy} onClick={()=>setManaging(true)}>Manage one-time tasks</button><button type="button" disabled={busy||!token} onClick={()=>token&&void commit((next,now)=>{if(!D.undo(next,token,now))throw new Error('This action changed or a new day began. Refresh your deck.')},'Last action undone')}>Undo last action</button><button type="button" disabled={busy||!cards[0]} onClick={()=>setTaskDetails(cards[0])}>Task details</button></>}<button type="button" disabled={busy} onClick={()=>void auth.open()}>Account</button><button type="button" disabled={busy} onClick={()=>setInfo(true)}>Help &amp; settings</button></TodayMenu>}<button type="button" className="primary add-task" aria-label={tab === 'Habits' ? 'New habit' : 'Add a task'} onClick={() => add(tab === 'Habits')}><Plus size={19}/><span>{tab === 'Habits' ? 'New habit' : 'Add a task'}</span></button></div></header>
      {error && <div className="error-banner" role="alert"><strong>We couldn’t open or save your deck.</strong><p>{error}</p><p>Existing browser data has not been reset.</p><button type="button" onClick={refresh}>Retry</button></div>}
      {!deck ? <div className="empty-state"><Leaf size={40}/><h2>{error ? 'Your deck is safely on hold.' : 'Opening your deck…'}</h2></div> : <>
      {tab === 'Today' && <div className="today-layout"><section className="deck-section" data-created-id={cards[0]?.id===createdCard?createdCard:undefined} aria-label="Today's task deck"><div className="deck-caption"><span className="dot"/> A LITTLE FOCUS GOES A LONG WAY<span className="deck-index">{cards.length ? `01 / ${String(cards.length).padStart(2, '0')}` : 'ALL CLEAR'}</span></div>
      {cards[0] ? <><TaskDeck onDetails={()=>setTaskDetails(cards[0])} cards={cards} exit={exit} onExitComplete={(id,phase)=>{const wait=exitWait.current;if(wait?.id===id&&wait.phase===phase)wait.done()}} onAction={type => action(type, cards[0])} onEdit={() => { const task = deck.tasks.find(t => t.id === cards[0].taskId); if (task) edit(task) }} busy={busy || modalOpen || menuOpen}/><div className="deck-actions"><button type="button" disabled={busy} className="action later" onClick={() => action('later', cards[0])}><span><RotateCcw size={29}/></span>Later</button><button type="button" disabled={busy} className="action done" onClick={() => action('done', cards[0])}><span><Check size={31}/></span>Done</button></div><p className="gesture-hint">Swipe left for later <span>·</span> right for done</p><div className="deck-options desktop-only"><button type="button" className="text-button" onClick={() => action('skip', cards[0])} disabled={busy}>Skip today</button><span>·</span><button type="button" className="text-button" disabled={busy} onClick={() => setReordering(true)}>Reorder deck</button></div></> : <div className="finished-card"><span className="finished-sun">☀</span><span className="pill">A LITTLE ROOM TO BREATHE</span><h2>That’s your deck.</h2><p>You’ve made space for what matters.<br/>Enjoy the rest of your day.</p><button type="button" className="secondary" onClick={() => add(false)}><Plus size={18}/> Add one small thing</button></div>}
      <button type="button" className="text-button manage-tasks desktop-only" disabled={busy} onClick={() => setManaging(true)}>Manage one-time tasks</button><div className="undo-slot desktop-only">{token && <button type="button" className="undo-button" disabled={busy} onClick={() => void commit((next,now) => { if (!D.undo(next,token,now)) throw new Error('This action changed or a new day began. Refresh your deck.') }, 'Last action undone')}><RotateCcw size={15}/> Undo last action</button>}</div></section>
      <aside className="today-sidebar"><div className="day-overview"><div className="section-label"><span>YOUR DAY, SO FAR</span><Leaf size={17}/></div><div className="overview-number">{counts!.completed}<span> / {counts!.completed + cards.length}</span></div><p>A little progress is still progress.</p><div className="progress-track"><span style={{ width: `${counts!.completed / Math.max(1, counts!.completed + cards.length) * 100}%` }}/></div><div className="count-labels"><span><i className="lime-dot"/>{counts!.completed} completed</span><span>{cards.length} remaining</span></div></div>
      <DeckQueue revealId={createdCard} cards={cards} exit={exit} disabled={busy||modalOpen} edit={id=>{const task=deck.tasks.find(t=>t.id===id);if(task)edit(task)}}/>
<div className="quiet-note"><span>“</span><p>You don’t have to do it all.<br/>Just the next thing.</p><div className="note-line"/></div></aside></div>}
      {tab === 'Habits' && <section className="manage-page"><div className="section-heading"><h2>Your recurring rituals</h2><span>{deck.tasks.filter(t => t.weekdays.length && !t.archived).length} habits</span></div><div className="habit-grid">{deck.tasks.filter(t => t.weekdays.length && !t.archived).map((task,i) => <button type="button" className={`habit-card ${task.photoId?'has-cover':''}`} key={task.id} onClick={() => edit(task)}>{task.photoId?<div className="habit-cover"><TaskVisual icon={task.icon} photoId={task.photoId}/></div>:<span className={`habit-icon color-${i%3}`}><TaskVisual icon={task.icon} small/></span>}<Pencil className="edit-indicator" size={17}/><h3>{task.title}</h3><p>{task.notes || 'A small promise to yourself.'}</p><div className="weekday-chips">{[1,2,3,4,5,6,0].map(d => <span key={d} className={task.weekdays.includes(d) ? 'on' : ''}>{weekNames[d][0]}</span>)}</div><small>{task.weekdays.length === 7 ? 'Every day' : task.weekdays.map(d => weekNames[d]).join(', ')}{task.deadline ? ` · ${byTime(task.deadline)}` : ''}</small>{D.pendingScheduleChange(task,today)&&<small className="schedule-effective">Schedule and text changes from {D.prettyDay(D.pendingScheduleChange(task,today)!,{month:'short',day:'numeric'})}.</small>}</button>)}<button type="button" className="habit-card add-habit" onClick={() => add(true)}><Plus size={30}/><h3>Make a little ritual</h3><p>Start small. Make it yours.</p></button></div><p className="footnote">Habit schedule and text edits normally start tomorrow; the edit form shows the exact date. Today’s cards and historical records stay intact.</p></section>}
      {tab === 'Progress' && <Progress deck={deck} today={today} openDetail={(card,day) => {setDetail(card);setDetailDay(day)}}/>}
      </>}
      <PwaControls editing={modalOpen || busy} container={settingsTarget}/><footer className="page-footer"><div className="plan-usage" aria-label="Plan usage"><span>Tasks {planUsage.tasks}/{pro?'Unlimited':10}</span><span>Habits {planUsage.habits}/{pro?'Unlimited':5}</span></div><span><span className="status-dot"/> Saved in this browser · no device sync</span><button type="button" onClick={() => setInfo(true)}>No account. Just your own pace. <ArrowUpRight size={13}/></button></footer>
    </main><div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{toast?<span key={toast.id}>{toast.message}</span>:<span key={announcementSequence}>{announcement}</span>}</div>
    {toast && !modalOpen && <Toast key={toast.id} toast={toast} disabled={busy} dismiss={id=>setToast(current=>current?.id===id?null:current)} undo={id=>void commit((next,now)=>{if(!D.undo(next,id,now))throw new Error('This action changed or a new day began. Refresh your deck.')},'Last action undone')}/>}
    {editor && <Editor pendingDay={deck?D.pending(deck,today).find(c=>c.taskId===editor.id)?.day:undefined} onUpgrade={kind=>setUpgrade(new LimitError(kind))} task={editor} habit={editingHabit} exists={!!deck?.tasks.some(t => t.id === editor.id)} close={() => setEditor(null)} error={error} busy={busy} usage={planUsage} unlimited={pro} save={async task => {
      let fresh=false,cardId:string|undefined
      const creating=!deck?.tasks.some(t=>t.id===task.id)
      const success=await commit((next,now)=>{fresh=!next.tasks.some(t=>t.id===task.id);D.saveTask(next,task,D.dayKey(now));cardId=D.pending(next,D.dayKey(now)).find(c=>c.taskId===task.id)?.id},creating?undefined:task.remind?'Deadline saved. Browser reminders are not scheduled.':'Your task is saved')
      if(success){setEditor(null);if(fresh){setToast(null);setAnnouncement(`Created: ${task.title}`);setAnnouncementSequence(n=>n+1);if(cardId){setTab('Today');setCreatedCard(cardId)}else setTab('Habits')}}
      return success
    }} remove={async () => { if (await commit((next,now) => D.removeTask(next,editor.id,now), 'Removed. Your history is preserved.')) setEditor(null) }}/>}
    {managing && deck && <Modal title="One-time tasks" close={() => setManaging(false)}><p className="modal-description">Today-only tasks stay separate from your recurring habits.</p><div className="list-panel">{deck.tasks.filter(t => !D.isHabit(t) && !t.archived).map(task => <button type="button" className="task-manage-row" key={task.id} onClick={() => {setManaging(false);edit(task)}}><span><strong>{task.title}</strong><small>{D.pending(deck,today).some(c => c.taskId===task.id) ? 'In your deck' : 'Resolved · history preserved'}</small>{task.deadline&&<small>{byTime(task.deadline)}</small>}</span><Pencil size={17}/></button>)}{!deck.tasks.some(t => !D.isHabit(t) && !t.archived) && <p className="empty-list muted">No one-time tasks yet.</p>}</div><button type="button" className="primary full" onClick={() => {setManaging(false);add(false)}}><Plus size={17}/>Add a task</button></Modal>}
    {reordering && deck && <Modal title="A little order" close={() => setReordering(false)}><p className="modal-description">Choose what comes next. Use the arrows to move each card.</p><div className="reorder-list">{cards.map((card,i) => <div className="reorder-row" key={card.id}><span className="order-number">{i+1}</span><span>{card.title}<DeadlineLabel card={card}/></span><button type="button" disabled={i===0 || busy} aria-label={`Move ${card.title} up`} className="icon-button" onClick={() => void commit(next => { const ids = D.pending(next).map(c => c.id); const at = ids.indexOf(card.id); if (at > 0) { [ids[at-1],ids[at]]=[ids[at],ids[at-1]]; D.reorder(next,ids) } })}><ArrowUp size={17}/></button><button type="button" disabled={i===cards.length-1 || busy} aria-label={`Move ${card.title} down`} className="icon-button" onClick={() => void commit(next => { const ids = D.pending(next).map(c => c.id); const at=ids.indexOf(card.id); if (at>=0 && at<ids.length-1) { [ids[at],ids[at+1]]=[ids[at+1],ids[at]]; D.reorder(next,ids) } })}><ArrowDown size={17}/></button></div>)}</div><button type="button" className="primary full" onClick={() => setReordering(false)}>Done</button></Modal>}
    {taskDetails&&<Modal title="Task details" close={()=>setTaskDetails(null)}><TaskVisual {...D.appearance(taskDetails)}/><h3 className="task-details-title">{taskDetails.title}</h3><p className="task-details-notes">{taskDetails.notes||'No notes added.'}</p><DeadlineLabel card={taskDetails}/>{taskDetails.remind&&<p>{webReminderStatus(taskDetails)}</p>}</Modal>}
    {detail && <Modal title="Card history" close={() => setDetail(null)}><TaskVisual {...D.appearance(detail,detailDay)}/><h3>{detail.title}</h3><DeadlineLabel card={detail}/><p className="modal-description">Scheduled {D.prettyDay(detail.day)}</p>{detail.notes && <p>{detail.notes}</p>}<ol className="event-log">{detail.events.map(e => <li key={e.id}><span className={`event-dot ${e.action}`}/><div><strong>{{done:'Completed',later:'Moved to end of deck',skip:'Explicitly skipped',delete:'Deleted',undo:'Previous action undone',reorder:'Deck reordered'}[e.action]}{detail.events.some(u => u.target===e.id) ? ' (undone)' : ''}</strong><time dateTime={e.at}>{new Date(e.at).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'})}</time></div></li>)}</ol>{!detail.events.length && <p className="muted">No actions recorded. Unfinished past occurrences remain missed.</p>}</Modal>}
    {info && <Modal title="Your deck, your pace." close={() => setInfo(false)}><h3>Help &amp; settings</h3><AccountSection/><Notifications/><SupabaseConnection/><div className="plan-usage" aria-label="Plan usage"><span>Tasks {planUsage.tasks}/{pro?'Unlimited':10}</span><span>Habits {planUsage.habits}/{pro?'Unlimited':5}</span></div>      <section className="widget-preview" aria-label="Widget preview"><div className="section-label"><span>WIDGET PREVIEW</span><span>TEST ONLY</span></div>{cards[0] ? <><div className="preview-card"><TaskVisual {...D.appearance(cards[0])} small/><div><p className="widget-title">{cards[0].title}</p><DeadlineLabel card={cards[0]}/><small>{cards.length} remaining</small></div></div><div className="preview-actions"><button type="button" className="secondary" aria-label="Widget preview: Later" disabled={busy} onClick={() => void action('later',cards[0],true)}><RotateCcw size={16}/>Later</button><button type="button" className="secondary preview-done" aria-label="Widget preview: Done" disabled={busy} onClick={() => void action('done',cards[0],true)}><Check size={16}/>Done</button></div></> : <p>Room to breathe. No pending tasks.</p>}<p className="preview-disclaimer">Browser interaction test, not an iOS widget.</p></section><div ref={setSettingsTarget}/><div className="info-leaf"><Leaf size={38}/></div><h3>A quiet place for the next thing.</h3><p>Your tasks and history are stored locally in this browser. Optional Preview accounts do not enable cloud sync. <strong>Different browsers, devices, and the native iPhone app do not sync.</strong> Clearing browser data removes this deck; private browsing may not retain it.</p><h3>A fresh day, not a reset.</h3><p>At local midnight, scheduled habits get independent new cards. Past unfinished habits remain in history. One-time tasks carry forward until completed, explicitly skipped, or deleted. Later never means Done or Skip. Weeks start Monday.</p><p>Daily Deck reconciles on launch, on returning to the foreground, at local midnight while open, and before every action. A 30-second fallback also detects clock/timezone changes; closed-app catch-up does not depend on timers. Day keys stay attached to their original local date when you travel. Habit edits normally apply tomorrow; the editor shows the exact effective date and preserves already-visited dates after clock changes. Deleted habits remove unfinished cards from today and future days, preserving past history and completed/skipped records.</p><DataControls changed={refresh} onLimit={setUpgrade}/>{PreviewTools&&<React.Suspense fallback={<p>Opening test tools…</p>}><PreviewTools/></React.Suspense>}<h3>About the iPhone widget</h3><p>The native Home Screen widget belongs to the separate SwiftUI iPhone app. This browser app does not provide an interactive iOS widget.</p></Modal>}
    {upgrade&&<Modal title="Free allowance reached" close={()=>setUpgrade(null)}><p className="upgrade-info">{upgrade.message}</p>{!pro&&<p className="quota-current">{planUsage[upgrade.kind]} of {FREE[upgrade.kind]} {upgrade.kind==='tasks'?'active tasks':'habits'}</p>}<p>Unlimited use is planned. Live checkout is not available, and no payment is taken. Browser-local limits are for prototype testing; they cannot securely verify a paid entitlement.</p>{PreviewTools&&<React.Suspense fallback={<p>Opening test tools…</p>}><PreviewTools/></React.Suspense>}<button type="button" className="primary full" onClick={()=>setUpgrade(null)}>Back to draft</button></Modal>}
  </div>
}
function Progress({deck,today,openDetail}:{deck:Deck;today:string;openDetail:(card:Card,day:string)=>void}) {
  const [selected,setSelected]=useState(today);const [month,setMonth]=useState(today.slice(0,7)+'-01');const [period,setPeriod]=useState<Period>('day');const [filter,setFilter]=useState('')
  const days=D.periodDays(month,'month');const blank=(D.dateOf(days[0]).getDay()+6)%7
  const counts=D.summarize(deck,selected,period,today,filter);const rows=D.history(deck,selected,today,filter)
  const remaining=D.pending(deck,today).length
  const summary=selected===today&&period==='day'&&!filter?[`${counts.completed} completed`,`${remaining} remaining`,...Object.entries(counts).filter(([key,n])=>!['completed','pending'].includes(key)&&n>0).map(([key,n])=>`${n} ${key}`)].join(', '):D.summaryText(counts)
  const changeMonth=(offset:number)=>{const date=D.dateOf(month);date.setMonth(date.getMonth()+offset);setMonth(D.dayKey(date))}
  return <div className="progress-layout"><section className="progress-left"><div className="calendar-panel"><div className="calendar-heading"><h2>{D.prettyDay(month,{month:'long',year:'numeric'})}</h2><div><button type="button" className="icon-button" aria-label="Previous month" onClick={()=>changeMonth(-1)}><ChevronLeft size={19}/></button><button type="button" className="icon-button" aria-label="Next month" disabled={month.slice(0,7)>=today.slice(0,7)} onClick={()=>changeMonth(1)}><ChevronRight size={19}/></button></div></div><div className="calendar-grid">{['M','T','W','T','F','S','S'].map((d,i)=><span key={i} className="weekday-label">{d}</span>)}{Array.from({length:blank},(_,i)=><span key={`blank-${i}`}/>)}{days.map(day=>{const c=D.summarize(deck,day,'day',today,filter);return <button type="button" key={day} aria-label={D.prettyDay(day)} aria-pressed={day===selected} disabled={day>today} className={`${day===selected?'chosen':''} ${day===today?'is-today':''}`} onClick={()=>setSelected(day)}>{Number(day.slice(-2))}<span className={c.completed?'calendar-dot complete':c.missed||c.postponed||c.skipped?'calendar-dot recorded':'calendar-dot'}/></button>})}</div><button type="button" className="text-button calendar-today" onClick={()=>{setMonth(today.slice(0,7)+'-01');setSelected(today)}}>Back to today <ArrowUpRight size={13}/></button><p className="calendar-legend"><span><i className="lime-dot"/>Completed</span><span><i className="peach-dot"/>Other activity</span></p></div>
  <div className="rhythm-panel"><div className="section-label"><span>WEEKLY COMPLETION</span><Leaf size={16}/></div><div className="week-bars">{D.periodDays(selected,'week').map(day=>{const c=D.summarize(deck,day,'day',today,filter);const total=Object.values(c).reduce((a,b)=>a+b,0)-c.deleted;return <div className="week-bar" key={day} aria-label={`${D.prettyDay(day)}: ${c.completed} of ${total} completed`}><div className="bar-track"><span style={{height:`${day<=today&&total?c.completed/total*100:0}%`}}/></div><small>{weekNames[D.dateOf(day).getDay()]}</small></div>})}</div></div></section>
  <section className="history-panel"><div className="history-controls"><label className="filter-label">Show<select aria-label="Filter history" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">All tasks & habits</option>{deck.tasks.map(t=><option key={t.id} value={t.id}>{t.title}{t.archived?' (deleted)':''}</option>)}</select></label><div className="segmented" aria-label="Summary period">{(['day','week','month'] as const).map(p=><button type="button" key={p} aria-pressed={p===period} onClick={()=>setPeriod(p)}>{p[0].toUpperCase()+p.slice(1)}</button>)}</div></div><div className="summary-panel"><p className="eyebrow">{selected===today&&period==='day'?'YOUR DAY, SO FAR':`YOUR ${period.toUpperCase()}, IN LITTLE STEPS`}</p><h2>{selected===today&&period==='day'?'Today':period==='week'?'This week':period==='month'?'This month':'Daily summary'}</h2><p data-testid="summary">{summary}</p>{selected===today&&period==='day'&&!filter&&<><div className="progress-track" role="progressbar" aria-label="Today completion" aria-valuemin={0} aria-valuemax={Math.max(1,counts.completed+remaining)} aria-valuetext={`${counts.completed} completed, ${remaining} remaining`} aria-valuenow={counts.completed}><span style={{width:`${counts.completed/Math.max(1,counts.completed+D.pending(deck,today).length)*100}%`}}/></div></>}{period!=='day'&&<small>Counts are daily outcomes; carried tasks can appear on multiple days.</small>}</div><div className="section-heading"><h2>{selected===today?'Today':D.prettyDay(selected,{month:'short',day:'numeric'})}</h2><span>{rows.length} cards</span></div><div className="history-list">{rows.map(card=>{const status=D.outcome(card,selected,today);const completed=D.active(card,selected).findLast(e=>e.action==='done');return <button type="button" className="history-row" key={card.id} onClick={()=>openDetail({...card,events:card.events.filter(e=>e.day<=selected)},selected)}><span className={`outcome-icon ${status}`}>{status==='completed'?<Check size={17}/>:status==='postponed'?<RotateCcw size={16}/>:status==='skipped'?<ChevronRight size={17}/>:status==='missed'?<Clock3 size={16}/>:<span/>}</span><span className="history-title"><strong>{card.title}</strong><small>{completed?`Completed at ${new Date(completed.at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}`:card.habit?'Habit occurrence':'One-time task'}</small></span><DeadlineLabel card={card}/><span className={`outcome-badge ${status}`}>{status}</span><ChevronRight size={16}/></button>})}{!rows.length&&<div className="history-empty"><CalendarDays size={34}/><h3>A quiet day.</h3><p>No cards scheduled for this date.</p></div>}</div></section></div>
}

// Scrub callback credentials before any asynchronous Auth work or UI rendering.
void auth.start()
createRoot(document.getElementById('root')!).render(<><App/><AuthDialog/></>)
