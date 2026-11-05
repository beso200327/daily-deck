// Actual Chromium screencasts and selected frames. Fresh synthetic-data contexts; no owner data is opened.
import {chromium} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
const dest=new URL('../../../docs/evidence/later-refinement/',import.meta.url).pathname
await mkdir(dest,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']})
for(const {n,scroll} of [{n:1,scroll:0},{n:2,scroll:0},{n:4,scroll:0},{n:10,scroll:0},{n:10,scroll:100}]){
 const name=`${n}-items${scroll?'-scrolled':''}`,page=await browser.newPage({viewport:{width:1440,height:1000}})
 await page.goto('http://127.0.0.1:4173');await page.getByTestId('active-card').waitFor()
 await page.evaluate(n=>{const key='daily-deck.web.v1',d=JSON.parse(localStorage.getItem(key));d.tasks=d.tasks.slice(0,Math.min(n,3));d.cards=d.cards.slice(0,Math.min(n,3));const day=d.cards[0].day;for(let i=3;i<n;i++){const id=`capture-${i}`,title=['Plan tomorrow','Water the plants','Reply to a friend','Tidy the desk','Make time for music','Prepare lunch','Stretch gently'][i-3];d.tasks.push({id,title,kind:'today',icon:'neutral',notes:'One small thing.',minutes:5,weekdays:[],created:day,through:day,archived:false});d.cards.push({id:`occ-${i}`,taskId:id,title,icon:'neutral',notes:'One small thing.',minutes:5,habit:false,day,initialOrder:i+1,events:[]})}localStorage.setItem(key,JSON.stringify(d))},n)
 await page.reload();await page.getByTestId('active-card').waitFor();await page.getByTestId('queue-scroll').evaluate((p,s)=>p.scrollTop=s,scroll);await page.waitForTimeout(320)
 await page.screenshot({path:dest+name+'-queue.png'})
 const session=await page.context().newCDPSession(page),video=[]
 session.on('Page.screencastFrame',frame=>{video.push({data:frame.data,time:frame.metadata.timestamp});void session.send('Page.screencastFrameAck',{sessionId:frame.sessionId})})
 const origin=await page.evaluate(()=>performance.timeOrigin)
 await session.send('Page.startScreencast',{format:'jpeg',quality:90,maxWidth:1440,maxHeight:1000,everyNthFrame:1})
 await page.evaluate(()=>{const w=window;w.motionCard=document.querySelector('[data-testid=active-card]');w.motionRow=document.querySelector(`[data-occurrence-id="${w.motionCard.dataset.cardId}"]`);w.motionFrames=[];w.motionEvents=[];w.recordMotion=true;for(const name of ['transitionstart','transitionend','animationstart','animationend'])w.motionCard.addEventListener(name,e=>{if(e.propertyName==='transform'||e.animationName==='deck-later-return')w.motionEvents.push({name,phase:w.motionCard.dataset.phase,ms:performance.now(),elapsed:e.elapsedTime*1000})});const sample=()=>{const c=w.motionCard,r=w.motionRow,p=document.querySelector('.queue-scroll'),a=c.getBoundingClientRect(),b=r.getBoundingClientRect(),v=p.getBoundingClientRect(),stack=document.querySelector('.card-stack').getBoundingClientRect();w.motionFrames.push({ms:performance.now(),phase:c.dataset.phase,busy:document.querySelector('.action.later').disabled,connected:c.isConnected,opacity:getComputedStyle(c).opacity,left:a.left,right:a.right,top:a.top,bottom:a.bottom,stackLeft:stack.left,z:getComputedStyle(c).zIndex,queueStage:r.dataset.queueStage,rowConnected:r.isConnected,rowTop:b.top,rowBottom:b.bottom,rowZ:getComputedStyle(r).zIndex,shadow:getComputedStyle(r).boxShadow,scroll:p.scrollTop,portTop:v.top,portBottom:v.bottom,windowScroll:scrollY});if(w.recordMotion)requestAnimationFrame(sample)};requestAnimationFrame(sample)})
 await page.getByRole('button',{name:'Later',exact:true}).click()
 await page.waitForFunction(()=>!document.querySelector('.action.later').disabled)
 await page.waitForTimeout(120);await session.send('Page.stopScreencast')
 const data=await page.evaluate(()=>{window.recordMotion=false;return{samples:window.motionFrames,events:window.motionEvents}})
 await page.screenshot({path:dest+name+'-finished.png'})
 const outStart=data.events.find(e=>e.name==='transitionstart'&&e.phase==='out')?.ms??data.samples.find(f=>f.phase==='out').ms
 const returnStart=data.events.find(e=>e.name==='animationstart')?.ms??data.samples.find(f=>f.phase==='return').ms
 const picks={outward:outStart+190,return:returnStart+170,settling:returnStart+430}
 if(n>=4)for(const [label,target] of Object.entries(picks)){const frame=video.reduce((a,b)=>Math.abs((a.time*1000-origin)-target)<Math.abs((b.time*1000-origin)-target)?a:b);await writeFile(dest+name+'-'+label+'.jpg',Buffer.from(frame.data,'base64'))}
 await writeFile(dest+name+'-frames.json',JSON.stringify({viewport:{width:1440,height:1000},syntheticPending:n,initialScroll:scroll,events:data.events,samples:data.samples},null,2))
 const temp=new URL(`../test-results/refinement-video/${name}/`,import.meta.url).pathname;await mkdir(temp,{recursive:true});for(let i=0;i<video.length;i++)await writeFile(`${temp}${i}.jpg`,Buffer.from(video[i].data,'base64'));await writeFile(temp+'frames.txt',video.map((f,i)=>`file '${temp}${i}.jpg'\nduration ${i<video.length-1?Math.max(.01,video[i+1].time-f.time):.3}`).join('\n'))
 const encoded=spawnSync('ffmpeg',['-y','-loglevel','error','-f','concat','-safe','0','-i',temp+'frames.txt','-an','-c:v','libvpx-vp9','-crf','34','-b:v','0','-pix_fmt','yuv420p',dest+name+'.webm'],{encoding:'utf8'});if(encoded.status!==0)throw new Error(encoded.stderr)
 const busy=data.samples.filter(f=>f.busy),firstReturn=data.samples.find(f=>f.phase==='return'),end=data.events.find(e=>e.name==='animationend');console.log(JSON.stringify({name,recordedFrames:video.length,nativeTimings:data.events.filter(e=>['animationend','transitionend'].includes(e.name)),opaqueAndMounted:busy.every(f=>f.connected&&f.opacity==='1'),phases:[...new Set(data.samples.map(f=>f.queueStage))],scrollPreserved:data.samples.every(f=>f.scroll===scroll),returnSamplesMs:end&&firstReturn?end.ms-firstReturn.ms:null}))
 await page.close()
}
await browser.close()
