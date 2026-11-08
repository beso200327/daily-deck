import {test,expect} from '@playwright/test'
test('reload and browser history preserve safe page routes',async({page})=>{
 await page.goto('/')
 for(const name of ['Today','Habits','Progress']){
  await page.getByRole('button',{name,exact:true}).click()
  await page.reload()
  await expect(page.getByRole('button',{name,exact:true})).toHaveAttribute('aria-current','page')
 }
 await page.goBack()
 await expect(page.getByRole('button',{name:'Habits',exact:true})).toHaveAttribute('aria-current','page')
 await page.goForward()
 await expect(page.getByRole('button',{name:'Progress',exact:true})).toHaveAttribute('aria-current','page')
 await page.goto('/#unknown')
 await expect(page).toHaveURL(/\/#today$/)
 await expect(page.getByRole('button',{name:'Today',exact:true})).toHaveAttribute('aria-current','page')
})
