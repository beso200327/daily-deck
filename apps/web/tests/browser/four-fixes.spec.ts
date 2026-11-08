import {test,expect,type Page} from '@playwright/test'
import {openHelp} from './navigation'
const state=(p:Page)=>p.evaluate(()=>JSON.parse(localStorage.getItem('daily-deck.web.v1')!))
async function ready(p:Page){await p.goto('/');await expect(p.getByTestId('active-card')).toBeVisible()}
async function bounds(p:Page){return p.getByRole('dialog').last().evaluate(el=>{const c=el.querySelector('.modal-content')!,r=el.getBoundingClientRect();return{left:r.left,right:r.right,vw:visualViewport!.width,scroll:c.scrollWidth,client:c.clientWidth,root:document.documentElement.scrollWidth,w:innerWidth,x:scrollX}})}
for(const width of [320,375,390,430])test(`create/edit forms at ${width}: long text, deadline, photo controls, keyboard-sized viewport`,async({page})=>{
 await page.setViewportSize({width,height:844});await ready(page)
 for(const mode of ['create-task','create-habit','edit-habit']){
  if(mode==='edit-habit')await page.getByRole('button',{name:'Edit current task',exact:true}).click()
  else {await page.getByRole('button',{name:'Add a task',exact:true}).click();if(mode==='create-habit')await page.getByRole('button',{name:'Recurring habit',exact:true}).click()}
  const form=page.getByRole('dialog').last();await expect(page.getByLabel('Choose task photo',{exact:true})).toBeHidden();await page.getByLabel('Title',{exact:true}).fill('LongUnbrokenTaskTitle'.repeat(8));await page.getByLabel('Notes').fill('LongUnbrokenNote'.repeat(150));await page.getByLabel('Complete by',{exact:true}).fill('14:00');await page.getByLabel('Remind me 30 minutes before').check();await page.setViewportSize({width,height:400})
  for(const name of ['Title','Notes','Complete by','Task icon']){
   const control=page.getByLabel(name,{exact:name!=='Notes'});await control.focus();await expect.poll(async()=>{const m=await bounds(page);return m.scroll<=m.client+1&&m.left>=0&&m.right<=m.vw+1&&m.root<=m.w+1&&m.x===0}).toBe(true)
   await page.mouse.wheel(300,0);const m=await bounds(page);expect(m.x).toBe(0);expect(m.scroll).toBeLessThanOrEqual(m.client+1)
  }
  await form.getByRole('button',{name:'Choose photo',exact:true}).scrollIntoViewIfNeeded();await expect(form.getByRole('button',{name:'Choose photo',exact:true})).toBeInViewport();expect((await bounds(page)).scroll).toBeLessThanOrEqual((await bounds(page)).client+1)
  await form.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await page.setViewportSize({width,height:844})
 }
})
test('mobile header controls share centers and remain independent of wrapping on all tabs',async({page})=>{
 await ready(page)
 // Force larger heading/subtitle text too, including tabs with legacy px styles.
 await page.addStyleTag({content:'.page-header h1{font-size:2.25rem!important}.page-header .subtitle{font-size:.85rem!important}'})
 for(const width of [320,375,390,430])for(const large of [false,true]){
  await page.setViewportSize({width,height:844});await page.evaluate(large=>document.documentElement.style.fontSize=large?'28px':'16px',large)
  for(const tab of ['Today','Habits','Progress']){
   await page.getByRole('button',{name:tab,exact:true}).click()
   const m=await page.locator('.page-header').evaluate(el=>{const menu=el.querySelector('summary')!.getBoundingClientRect(),add=el.querySelector('.add-task')!.getBoundingClientRect(),r=el.getBoundingClientRect();return{menu:[menu.width,menu.height,menu.top+menu.height/2],add:[add.width,add.height,add.top+add.height/2],right:r.right-add.right,inset:el.closest('.main-content')!.getBoundingClientRect().right-add.right,over:document.documentElement.scrollWidth>innerWidth}})
   expect(m.menu.slice(0,2)).toEqual([44,44]);expect(m.add.slice(0,2)).toEqual([44,44]);expect(m.menu[2]).toBeCloseTo(m.add[2],1);expect(m.right).toBeCloseTo(0,1);expect(m.inset).toBeCloseTo(20,1);expect(m.over).toBe(false)
  }
 }
})
test('clearing a saved deadline clears reminder and overdue; cancel preserves the saved deadline',async({page})=>{
 await page.clock.install({time:new Date('2026-11-05T20:00:00Z')});await ready(page);await page.getByRole('button',{name:'Edit current task',exact:true}).click();await page.getByLabel('Complete by',{exact:true}).fill('14:00');await page.getByLabel('Remind me 30 minutes before').check();await page.getByRole('button',{name:'Save habit',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByTestId('active-card').locator('.deadline-label')).toContainText('Overdue');const id=await page.getByTestId('active-card').getAttribute('data-card-id')
 await page.getByRole('button',{name:'Edit current task',exact:true}).click();await expect(page.getByRole('button',{name:'No deadline',exact:true})).toHaveAttribute('aria-pressed','false');await expect(page.locator('.deadline-selection')).toContainText(/By/);await expect(page.getByRole('button',{name:'Reset',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'No deadline',exact:true}).click();await expect(page.getByLabel('Complete by',{exact:true})).toHaveValue('');await expect(page.locator('.deadline-selection')).toHaveText('No deadline selected.');await page.getByRole('button',{name:'Cancel',exact:true}).click();expect((await state(page)).cards.find((c:any)=>c.id===id).deadline).toBe('14:00')
 await page.getByRole('button',{name:'Edit current task',exact:true}).click();await page.getByRole('button',{name:'No deadline',exact:true}).click();await page.getByRole('button',{name:'Save habit',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);let c=(await state(page)).cards.find((c:any)=>c.id===id);expect(c.deadline).toBeUndefined();expect(c.remind).toBe(false);await expect(page.getByTestId('active-card').locator('.deadline-label')).toHaveCount(0);await page.reload();await expect(page.getByTestId('active-card')).toBeVisible();c=(await state(page)).cards.find((c:any)=>c.id===id);expect(c.deadline).toBeUndefined();expect(c.remind).toBe(false)
})
test('iPhone settings report the missing Web Push dependency without requesting permission',async({page},info)=>{
 test.skip(info.project.name!=='iphone-size','iPhone capability gating')
 await page.addInitScript(()=>{(window as any).permissionCalls=0;Object.defineProperty(window,'Notification',{configurable:true,value:{permission:'default',requestPermission:async()=>{(window as any).permissionCalls++;return'granted'}}})});await ready(page);await openHelp(page);const section=page.getByRole('region',{name:'Notifications',exact:true});await expect(section).toContainText('push backend is not configured');await expect(section.getByRole('button',{name:'Enable notifications',exact:true})).toBeDisabled();await expect(section.getByRole('button',{name:'Send test notification',exact:true})).toBeDisabled();expect(await page.evaluate(()=>(window as any).permissionCalls)).toBe(0)
})
test('desktop permission request is explicit and denial never masquerades as delivery',async({page},info)=>{
 test.skip(info.project.name!=='desktop','desktop permission flow')
 await page.addInitScript(()=>{(window as any).permissionCalls=0;let permission='default';Object.defineProperty(window,'Notification',{configurable:true,value:{get permission(){return permission},requestPermission:async()=>{(window as any).permissionCalls++;permission='denied';return permission}}})});await ready(page);await openHelp(page);const section=page.getByRole('region',{name:'Notifications',exact:true});expect(await page.evaluate(()=>(window as any).permissionCalls)).toBe(0);await section.getByRole('button',{name:'Enable notifications',exact:true}).click();await expect(section.locator('.permission-status')).toHaveText('Permission status: Blocked');expect(await page.evaluate(()=>(window as any).permissionCalls)).toBe(1);await expect(section.getByRole('button',{name:'Send test notification',exact:true})).toBeDisabled();await expect(section.getByRole('status')).toContainText('blocked');await page.getByRole('button',{name:'Close dialog',exact:true}).click();await page.getByRole('button',{name:'Add a task',exact:true}).click();await expect(page.getByLabel('Title',{exact:true})).toBeEditable()
})
test('desktop test creates an actual service-worker system notification, not a toast',async({page,context},info)=>{
 test.skip(info.project.name!=='desktop','desktop system API; iPhone requires push backend')
 await context.grantPermissions(['notifications']);await ready(page);await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));await openHelp(page);const section=page.getByRole('region',{name:'Notifications',exact:true});await expect(section.locator('.permission-status')).toHaveText('Permission status: Granted');await section.getByRole('button',{name:'Send test notification',exact:true}).click();await expect(section.getByRole('status')).toContainText('Test handed to the system');const found=await page.evaluate(async()=>{const r=await navigator.serviceWorker.ready;const notices=await r.getNotifications({tag:'dailydeck-system-test'});const result=notices.map(n=>({title:n.title,body:n.body}));notices.forEach(n=>n.close());return result});expect(found).toEqual([{title:'Daily Deck — test notification',body:'This is a system notification test. Deadline reminders are not configured in the web app.'}]);await expect(page.getByRole('group',{name:'Notification',exact:true})).toHaveCount(0)
})
test('pinch magnifies the dialog without shrinking or chasing visual viewport panning',async({page},info)=>{
 test.skip(info.project.name!=='iphone-size','mobile zoom geometry')
 await ready(page);await page.getByRole('button',{name:'Edit current task',exact:true}).click();const width=await page.getByRole('dialog').evaluate(el=>el.getBoundingClientRect().width);const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:2});await page.evaluate(()=>visualViewport?.dispatchEvent(new Event('resize')));await expect.poll(()=>page.getByRole('dialog').evaluate(el=>el.getBoundingClientRect().width)).toBeCloseTo(width,1);expect(await page.evaluate(()=>visualViewport!.scale)).toBe(2);await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});await page.getByRole('button',{name:'Cancel',exact:true}).click()
})
test('opening the browser time picker leaves the form contained and cancellation leaves the draft intact',async({page})=>{
 await page.setViewportSize({width:375,height:400});await ready(page);await page.getByRole('button',{name:'Add a task',exact:true}).click();await page.getByLabel('Title',{exact:true}).fill('Keep this draft');const field=page.getByLabel('Complete by',{exact:true});await field.fill('14:00');await field.click();await field.evaluate((el:HTMLInputElement)=>el.showPicker());const m=await bounds(page);expect(m.scroll).toBeLessThanOrEqual(m.client+1);expect(m.right).toBeLessThanOrEqual(m.vw+1);expect(m.x).toBe(0);await page.keyboard.press('Escape');await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Keep this draft');await expect(field).toHaveValue('14:00')
})
