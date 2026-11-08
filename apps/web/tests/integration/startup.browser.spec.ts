import {test,expect,type Page} from '@playwright/test'
import {backend} from './cloud-fixture'
import {first} from './auth-fixture'
import {reset} from './cloud-db'
const guestKey='daily-deck.web.v1'
async function cloudMode(page:Page){
 await page.addInitScript(owner=>{
  localStorage.setItem(`daily-deck.cloud.${owner}.mode.v1`,'cloud')
  ;(window as any).seenCards=[]
  new MutationObserver(()=>{for(const card of document.querySelectorAll('[data-testid="active-card"]'))(window as any).seenCards.push(card.textContent)}).observe(document,{childList:true,subtree:true})
 },first)
}
async function noGuest(page:Page){expect(await page.evaluate(key=>localStorage.getItem(key),guestKey)).toBeNull();expect(await page.evaluate(()=>(window as any).seenCards)).toEqual([])}
test.beforeEach(()=>reset())
test('delayed verification and cloud read never seed or flash guest; empty cloud and routes survive reload',async({page})=>{
 const b=backend(),f=await b.install(page)
 let verified!:()=>void,loaded!:()=>void
 f.fixture.holdUser=new Promise<void>(r=>verified=r)
 b.state.hold=new Promise<void>(r=>loaded=r)
 await cloudMode(page)
 await page.goto('/#habits')
 await expect(page.getByRole('heading',{name:'Opening your deck…'})).toBeVisible()
 await noGuest(page)
 verified()
 await expect.poll(()=>b.calls.length).toBeGreaterThan(0)
 await noGuest(page)
 loaded()
 await expect(page.getByRole('button',{name:'Habits',exact:true})).toHaveAttribute('aria-current','page')
 await noGuest(page)
 for(const name of ['Today','Habits','Progress']){
  await page.getByRole('button',{name,exact:true}).click()
  await page.reload()
  await expect(page.getByRole('button',{name,exact:true})).toHaveAttribute('aria-current','page')
  await noGuest(page)
 }
 await page.screenshot({path:`/tmp/startup-${test.info().project.name}.png`,fullPage:true})
})
test('cloud startup failure remains gated; retry opens empty cloud without local fallback',async({page})=>{
 const b=backend();await b.install(page);b.state.offline=true;await cloudMode(page)
 await page.goto('/')
 await expect(page.getByRole('heading',{name:'Your deck is on hold'})).toBeVisible()
 await noGuest(page)
 b.state.offline=false
 await page.getByRole('button',{name:'Retry startup'}).click()
 await expect(page.getByRole('button',{name:'Today',exact:true})).toBeVisible()
 await noGuest(page)
})
test('verification error does not imply guest; intentional local selection stays available',async({page})=>{
 const b=backend(),f=await b.install(page);f.fixture.userFailure=true;await cloudMode(page)
 await page.goto('/')
 await expect(page.getByRole('heading',{name:'Your deck is on hold'})).toBeVisible()
 await noGuest(page)
 await page.getByRole('button',{name:'Use local deck',exact:true}).click()
 await expect(page.getByTestId('active-card')).toBeVisible()
})
test('verified intentional local mode retains guest data and route',async({page})=>{
 const b=backend();await b.install(page)
 await page.goto('/')
 await expect(page.getByTestId('active-card')).toBeVisible()
 const original=await page.evaluate(key=>localStorage.getItem(key),guestKey)
 await page.getByRole('button',{name:'Progress',exact:true}).click()
 await page.reload()
 await expect(page.getByRole('button',{name:'Progress',exact:true})).toHaveAttribute('aria-current','page')
 expect(await page.evaluate(key=>localStorage.getItem(key),guestKey)).toBe(original)
})
test('populated cloud reload hides cached cards until ownership and read resolve; offline cold start never reveals cache',async({page})=>{
 const b=backend();await b.install(page);await cloudMode(page)
 await page.goto('/')
 await expect(page.getByRole('button',{name:'Add a task',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Add a task',exact:true}).click()
 await page.getByLabel('Title',{exact:true}).fill('Private cloud task')
 await page.getByRole('button',{name:'Save task',exact:true}).click()
 await expect(page.getByTestId('active-card')).toContainText('Private cloud task')
 let release!:()=>void;b.state.hold=new Promise<void>(r=>release=r)
 await page.reload()
 await expect(page.getByRole('heading',{name:'Opening your deck…'})).toBeVisible()
 await noGuest(page)
 release();b.state.hold=null
 await expect(page.getByTestId('active-card')).toContainText('Private cloud task')
 b.state.offline=true
 await page.reload()
 await expect(page.getByRole('heading',{name:'Your deck is on hold'})).toBeVisible()
 await noGuest(page)
 b.state.offline=false
 await page.getByRole('button',{name:'Retry startup'}).click()
 await expect(page.getByTestId('active-card')).toContainText('Private cloud task')
})
test('account switch gates previous data during delayed verification and restores the second owner only',async({page})=>{
 const b=backend(),f=await b.install(page);await cloudMode(page)
 await page.goto('/')
 await page.getByRole('button',{name:'Add a task',exact:true}).click()
 await page.getByLabel('Title',{exact:true}).fill('Only account A')
 await page.getByRole('button',{name:'Save task',exact:true}).click()
 await expect(page.getByTestId('active-card')).toContainText('Only account A')
 let release!:()=>void;f.fixture.holdUser=new Promise<void>(r=>release=r)
 await page.evaluate(s=>{
  localStorage.setItem(`daily-deck.cloud.${s.user.id}.mode.v1`,'cloud')
  localStorage.setItem('sb-auth-fixture-auth-token',JSON.stringify(s))
  ;(window as any).seenCards=[]
  const channel=new BroadcastChannel('sb-auth-fixture-auth-token');channel.postMessage({event:'SIGNED_IN',session:s});channel.close()
 },f.session('second@example.test'))
 await expect(page.getByRole('heading',{name:'Opening your deck…'})).toBeVisible()
 await expect(page.getByTestId('active-card')).toHaveCount(0)
 await expect(page.locator('body')).not.toContainText('Only account A')
 release();f.fixture.holdUser=null
 await expect(page.getByRole('button',{name:'Today',exact:true})).toBeVisible()
 await noGuest(page)
})
