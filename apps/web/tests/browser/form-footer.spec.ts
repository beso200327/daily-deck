import {test,expect,type Page,type Locator} from '@playwright/test'
const active=(p:Page)=>p.getByTestId('active-card')
async function open(p:Page,mode:string){
 await p.getByRole('button',{name:mode==='edit-habit'?'Habits':'Today',exact:true}).click()
 if(mode==='edit-habit')await p.locator('.habit-card').filter({hasText:'Walk for 20 minutes'}).click()
 else if(mode==='edit-task')await p.getByRole('button',{name:'Edit current task',exact:true}).click()
 else{await p.getByRole('button',{name:'Add a task',exact:true}).click();if(mode==='new-habit')await p.getByRole('button',{name:'Recurring habit',exact:true}).click()}
 return p.getByRole('dialog').last()
}
async function reachable(locator:Locator){
 await locator.scrollIntoViewIfNeeded()
 await expect.poll(()=>locator.evaluate(el=>{const r=el.getBoundingClientRect(),body=el.closest('dialog')!.querySelector('.modal-content')!.getBoundingClientRect();return r.top>=body.top-1&&r.bottom<=body.bottom+1})).toBe(true)
}
test.beforeEach(async({page})=>{
 await page.clock.install({time:new Date('2026-11-05T17:00:00Z')});await page.goto('/');await expect(active(page)).toBeVisible()
 await page.getByRole('button',{name:'Add a task',exact:true}).click();await page.getByLabel('Title',{exact:true}).fill('Phone task');await page.getByLabel('Complete by',{exact:true}).fill('14:00');await page.getByLabel('Remind me 30 minutes before').check();await page.getByRole('button',{name:'Save task',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(active(page).locator('h2')).toHaveText('Phone task')
})
for(const width of [320,375,390])test(`all task/habit forms at ${width}px keep the clear action and messages outside the footer`,async({page},info)=>{
 for(const height of [844,400])for(const mode of ['new-task','new-habit','edit-task','edit-habit']){
  await page.setViewportSize({width,height});const dialog=await open(page,mode)
  if(mode.startsWith('new'))await expect(dialog.getByRole('button',{name:'No deadline',exact:true})).toHaveCount(0)
  await page.getByLabel('Title',{exact:true}).fill('Long task title without losing the draft');await page.getByLabel('Notes').fill('LongUnbrokenNotes'.repeat(100));const time=page.getByLabel('Complete by',{exact:true});await time.fill('14:00');await time.focus();await page.getByLabel('Remind me 30 minutes before').check()
  const clear=dialog.getByRole('button',{name:'No deadline',exact:true});await reachable(clear)
  const position=await clear.evaluate(el=>{const a=el.getBoundingClientRect(),i=el.closest('fieldset')!.querySelector('input[type=time]')!.getBoundingClientRect();return{top:a.top,inputBottom:i.bottom,right:i.right,left:i.left}})
  expect(position.top-position.inputBottom).toBeGreaterThanOrEqual(7);expect(position.left).toBeGreaterThanOrEqual(0);expect(position.right).toBeLessThanOrEqual(width)
  for(const selector of ['.reminder-choice','.deadline-picker>.footnote','.reminder-status','.photo-privacy','.photo-picker>.footnote'])await reachable(dialog.locator(selector))
  if(mode.endsWith('habit'))await reachable(dialog.locator('.weekday-picker'))
  if(mode.startsWith('edit'))await reachable(dialog.locator('.delete-section'))
  const m=await dialog.evaluate(el=>{const b=el.querySelector('.modal-content')!,f=el.querySelector('.modal-footer')!,r=b.getBoundingClientRect(),foot=f.getBoundingClientRect();b.scrollTop=b.scrollHeight;return{scroll:b.scrollWidth,client:b.clientWidth,bodyBottom:r.bottom,footerTop:foot.top,footerBottom:foot.bottom,height:visualViewport!.height,x:scrollX,padding:parseFloat(getComputedStyle(b).paddingBottom),nested:b.contains(f),vertical:b.scrollHeight>b.clientHeight}})
  expect(m.scroll).toBeLessThanOrEqual(m.client+1);expect(m.bodyBottom).toBeLessThanOrEqual(m.footerTop+1);expect(m.footerBottom).toBeLessThanOrEqual(m.height+1);expect(m.padding).toBeGreaterThanOrEqual(24);expect(m.nested).toBe(false);expect(m.vertical).toBe(true);expect(m.x).toBe(0)
  await reachable(dialog.locator('.deadline-picker>.footnote'))
  if(info.project.name==='iphone-size'&&width===375&&mode==='edit-task')await page.screenshot({path:`test-results/form-footer-${height}.png`})
  await clear.click();await expect(time).toHaveValue('');await expect(clear).toHaveCount(0);await expect(page.getByLabel('Remind me 30 minutes before')).toHaveCount(0)
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0)
 }
})
test('saving No deadline on a one-time task removes the persisted time and reminder preference',async({page})=>{
 await page.setViewportSize({width:320,height:400});await open(page,'edit-task');await page.getByRole('button',{name:'No deadline',exact:true}).click();await page.getByRole('button',{name:'Save task',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0)
 await page.reload();await expect(active(page).locator('h2')).toHaveText('Phone task');const task=await page.evaluate(()=>JSON.parse(localStorage.getItem('daily-deck.web.v1')!).tasks.find((t:any)=>t.title==='Phone task'));expect(task.deadline).toBeUndefined();expect(task.remind).toBe(false);await expect(active(page).locator('.deadline-label')).toHaveCount(0)
})
test('standalone-style safe areas and keyboard resizing reserve the footer separately from help text',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{document.documentElement.style.setProperty('--safe-top','47px');document.documentElement.style.setProperty('--safe-bottom','34px')});const dialog=await open(page,'edit-task')
 for(const height of [844,400]){await page.setViewportSize({width:390,height});await page.getByLabel('Complete by',{exact:true}).focus();await reachable(dialog.locator('.deadline-picker>.footnote'));const m=await dialog.evaluate(el=>({top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom,footer:el.querySelector('.modal-footer')!.getBoundingClientRect().bottom,body:el.querySelector('.modal-content')!.getBoundingClientRect().bottom,footerTop:el.querySelector('.modal-footer')!.getBoundingClientRect().top}));expect(m.top).toBeGreaterThanOrEqual(47);expect(m.bottom).toBeLessThanOrEqual(height-34+1);expect(m.footer).toBeLessThanOrEqual(height-34+1);expect(m.body).toBeLessThanOrEqual(m.footerTop+1)}
})
test('Enter submits the associated footer button and an empty title stays unsaved',async({page})=>{
 await open(page,'edit-task');const title=page.getByLabel('Title',{exact:true});await title.fill('');await title.press('Enter');await expect(page.getByRole('dialog')).toHaveCount(1);await title.fill('Updated with Enter');await title.press('Enter');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(active(page).locator('h2')).toHaveText('Updated with Enter')
})
