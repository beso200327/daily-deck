// Run with a production preview listening on :4173. Uses a fresh browser context and synthetic data only.
import {chromium} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
const dest=new URL('../../../docs/evidence/',import.meta.url).pathname
await mkdir(dest,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']})
const page=await browser.newPage({viewport:{width:1440,height:1000}})
await page.goto('http://127.0.0.1:4173');await page.getByTestId('active-card').waitFor()
await page.evaluate(()=>{const key='daily-deck.web.v1',d=JSON.parse(localStorage.getItem(key)),day=d.cards[0].day;for(let i=0;i<9;i++){const id=`evidence-task-${i}`,title=`${['Plan tomorrow','Water the plants','Reply to a friend','Tidy the desk','Practice a little','Make time for music','Prepare lunch','Stretch gently','Go outside'][i]}`;d.tasks.push({id,kind:'today',icon:'neutral',title,notes:'One small thing.',minutes:5,weekdays:[],created:day,through:day,archived:false});d.cards.push({id:`evidence-occ-${i}`,taskId:id,title,notes:'One small thing.',minutes:5,habit:false,icon:'neutral',day,initialOrder:i+4,events:[]})}localStorage.setItem(key,JSON.stringify(d))})
await page.reload();await page.getByTestId('queue-scroll').waitFor();await page.waitForTimeout(350)
await page.screenshot({path:dest+'desktop-queue.png'})
const session=await page.context().newCDPSession(page),video=[]
session.on('Page.screencastFrame',frame=>{video.push({data:frame.data,time:frame.metadata.timestamp});void session.send('Page.screencastFrameAck',{sessionId:frame.sessionId})})
await session.send('Page.startScreencast',{format:'jpeg',quality:85,maxWidth:1440,maxHeight:1000,everyNthFrame:1})
await page.evaluate(()=>{window.__card=document.querySelector('[data-testid=active-card]');window.__frames=[];const record=()=>{const el=window.__card,r=el.getBoundingClientRect();window.__frames.push({ms:Math.round(performance.now()),phase:el.dataset.phase,connected:el.isConnected,opacity:getComputedStyle(el).opacity,left:r.left,right:r.right});if(window.__frames.length<65)requestAnimationFrame(record)};requestAnimationFrame(record)})
await page.screenshot({path:dest+'later-00-before.png'})
await page.getByRole('button',{name:'Later',exact:true}).click();await page.waitForTimeout(90);await page.screenshot({path:dest+'later-01-outward.png'})
await page.locator('[data-phase=return]').waitFor();await page.screenshot({path:dest+'later-02-behind.png'});await page.waitForTimeout(100);await page.screenshot({path:dest+'later-03-settling.png'})
await page.getByRole('button',{name:'Done',exact:true}).waitFor();await page.waitForTimeout(400);await page.screenshot({path:dest+'later-04-finished.png'})
await session.send('Page.stopScreencast')
const frames=await page.evaluate(()=>window.__frames)
await writeFile(dest+'later-frames.json',JSON.stringify({viewport:{width:1440,height:1000},data:'Synthetic fixture: 3 habits, 9 active one-time tasks',frames},null,2))
const live=frames.filter(f=>f.connected),firstReturn=live.find(f=>f.phase==='return'),removed=frames.find(f=>!f.connected)
console.log(JSON.stringify({frames:frames.length,opaqueWhileMounted:live.every(f=>f.opacity==='1'),observedPhases:[...new Set(live.map(f=>f.phase))],unmountedAfterReturnMs:removed&&firstReturn?removed.ms-firstReturn.ms:null}))
const temp=new URL('../test-results/evidence-video/',import.meta.url).pathname;await mkdir(temp,{recursive:true})
for(let i=0;i<video.length;i++)await writeFile(`${temp}${i}.jpg`,Buffer.from(video[i].data,'base64'))
await writeFile(temp+'frames.txt',video.map((f,i)=>`file '${temp}${i}.jpg'\nduration ${i<video.length-1?Math.max(.01,video[i+1].time-f.time):.4}`).join('\n'))
const result=spawnSync('ffmpeg',['-y','-loglevel','error','-f','concat','-safe','0','-i',temp+'frames.txt','-an','-c:v','libvpx-vp9','-crf','34','-b:v','0','-pix_fmt','yuv420p',dest+'later-desktop.webm'],{encoding:'utf8'})
if(result.status!==0)throw new Error(result.stderr||'ffmpeg failed')
await browser.close()
