import { test, expect } from '@playwright/test'
test.beforeEach(async({page})=>{await page.goto('/');await expect(page.getByRole('heading',{name:'Walk for 20 minutes',exact:true})).toBeVisible()})
test('complete, postpone, undo, reload and keyboard controls',async({page})=>{
 await page.getByRole('button',{name:'Later',exact:true}).click();await expect(page.getByRole('heading',{name:'Read 10 pages',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Undo last action'}).click();await expect(page.getByRole('heading',{name:'Walk for 20 minutes',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Done',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByRole('heading',{name:'Read 10 pages',exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'Read 10 pages',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Progress',exact:true}).click();await expect(page.getByTestId('summary')).toContainText('1 completed');await expect(page.getByText(/Completed at/)).toBeVisible()
})
test('create edit reorder skip and delete a task',async({page})=>{
 await page.getByRole('button',{name:'Add a task',exact:true}).click();await page.getByLabel('Title',{exact:true}).fill('Plan tomorrow');await page.getByLabel('Notes').fill('Leave a little breathing room.');await page.getByRole('button',{name:'Save task',exact:true}).click()
 await page.getByRole('button',{name:'Reorder deck'}).click();await expect(page.getByRole('button',{name:'Move Plan tomorrow up'})).toBeDisabled();await page.getByRole('dialog').getByRole('button',{name:'Done',exact:true}).click();await expect(page.getByRole('heading',{name:'Plan tomorrow',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Edit current task'}).click();await page.getByLabel('Title',{exact:true}).fill('Plan a calm tomorrow');await page.getByRole('button',{name:'Save task',exact:true}).click();await expect(page.getByRole('heading',{name:'Plan a calm tomorrow',exact:true})).toBeVisible();await page.getByRole('button',{name:'Skip today',exact:true}).click()
 await page.getByRole('button',{name:'Manage one-time tasks',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:/Plan a calm tomorrow/}).click();await page.getByRole('button',{name:'Delete task',exact:true}).click();await page.getByRole('dialog',{name:'Delete task?',exact:true}).getByRole('button',{name:'Delete task',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0)
})
test('habit scheduling, preserved history, calendar and filters',async({page})=>{
 await page.getByRole('button',{name:'Habits',exact:true}).click();await page.getByRole('button',{name:/Walk for 20 minutes/}).click();await page.getByLabel('Title',{exact:true}).fill('Walk outside');await page.getByRole('button',{name:'Sun',exact:true}).click();await page.getByRole('button',{name:'Save habit',exact:true}).click()
 await page.getByRole('button',{name:/Walk outside/}).click();await page.getByRole('button',{name:'Delete habit',exact:true}).click();await page.getByRole('dialog',{name:'Delete habit?',exact:true}).getByRole('button',{name:'Delete habit',exact:true}).click();await page.getByRole('button',{name:'Progress',exact:true}).click();await page.getByLabel('Filter history').selectOption({label:'Walk outside (deleted)'});await expect(page.getByRole('button',{name:/Walk for 20 minutes Habit occurrence/})).toBeVisible()
 await page.getByRole('button',{name:'Previous month'}).click();await page.getByRole('button',{name:'Back to today'}).click();await page.getByRole('button',{name:'Week',exact:true}).click();await page.getByRole('button',{name:'Month',exact:true}).click();await expect(page.getByTestId('summary')).toContainText('1 deleted')
})
test('layouts, focus, reduced motion and screenshots',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:'reduce'})
 for(const tab of ['Today','Habits','Progress']){await page.getByRole('navigation').getByRole('button',{name:new RegExp(`^${tab}`)}).click();await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);if(tab==='Today'&&info.project.name==='iphone-size'){const action=await page.getByRole('button',{name:'Done',exact:true}).boundingBox();const nav=await page.locator('.navigation').boundingBox();expect(action!.y+action!.height).toBeLessThanOrEqual(nav!.y)}await page.screenshot({path:`test-results/${info.project.name}-${tab.toLowerCase()}.png`,fullPage:true})}
 await page.getByRole('button',{name:'Add a task',exact:true}).click();if(info.project.name==='iphone-size')await expect(page.getByRole('dialog').getByRole('heading')).toBeFocused();else await expect(page.getByLabel('Title',{exact:true})).toBeFocused();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);expect(errors).toEqual([])
})
test('actual pointer swipes advance the card in both directions',async({page})=>{
 const card=page.getByRole('article');let box=await card.boundingBox();if(!box)throw new Error('Missing card');await page.mouse.move(box.x+box.width/2,box.y+130);await page.mouse.down();await page.mouse.move(box.x+box.width/2+120,box.y+130,{steps:10});await page.mouse.up();await expect(page.getByRole('heading',{name:'Read 10 pages',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Later',exact:true})).toBeEnabled();box=await card.boundingBox();if(!box)throw new Error('Missing card');await page.mouse.move(box.x+box.width/2,box.y+130);await page.mouse.down();await page.mouse.move(box.x+box.width/2-120,box.y+130,{steps:10});await page.mouse.up();await expect(page.getByRole('heading',{name:'Drink a glass of water',exact:true})).toBeVisible()
})
test('malformed local data is preserved with an error',async({page})=>{await page.evaluate(()=>localStorage.setItem('daily-deck.web.v1','broken'));await page.reload();await expect(page.getByRole('alert')).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('daily-deck.web.v1'))).toBe('broken')})

test('local midnight creates fresh habit cards and preserves yesterday', async ({page}) => {
 await page.clock.install({time:new Date('2026-11-05T23:59:50-05:00')})
 await page.evaluate(()=>localStorage.clear());await page.reload()
 await page.getByRole('button',{name:'Later',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Read 10 pages',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Later',exact:true})).toBeEnabled()
 await page.clock.fastForward(40_000)
 await expect(page.getByRole('heading',{name:'Walk for 20 minutes',exact:true})).toBeVisible()
 const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('daily-deck.web.v1')!))
 expect(new Set(data.cards.map((c:{day:string})=>c.day))).toEqual(new Set(['2026-11-05','2026-11-06']))
 await page.getByRole('button',{name:'Progress',exact:true}).click()
 await page.getByRole('button',{name:'November 5, 2026',exact:true}).click()
 await expect(page.getByTestId('summary')).toContainText('1 postponed')
 await expect(page.getByTestId('summary')).toContainText('2 missed')
})
test('touch events complete the visible card on mobile',async({page},info)=>{
 test.skip(info.project.name!=='iphone-size','Touch emulation is exercised in the mobile project.')
 const box=await page.getByRole('article').boundingBox();if(!box)throw new Error('Missing card')
 const session=await page.context().newCDPSession(page);const x=box.x+box.width/2,y=box.y+130
 await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]})
 for(let i=1;i<=8;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+i*15,y}]})
 await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
 await expect(page.getByRole('heading',{name:'Read 10 pages',exact:true})).toBeVisible()
})
test('compact phone and tablet widths have no horizontal overflow',async({page})=>{
 for(const width of [320,768,1024]) {
  await page.setViewportSize({width,height:900})
  for(const name of ['Today','Habits','Progress']) {
   // Tablet icon-only navigation retains accessible names via aria-label.
   await page.getByRole('navigation').getByRole('button',{name:new RegExp(`^${name}`)}).click()
   await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
  }
 }
})
