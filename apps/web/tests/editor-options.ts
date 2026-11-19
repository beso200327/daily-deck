import type { Locator, Page } from '@playwright/test'

export async function revealEditorOption<T extends Locator | Page>(scope: T, name: string): Promise<T> {
  const summary = scope.locator(`details.editor-option > summary[data-editor-option=${JSON.stringify(name)}]`).last()
  const panel = summary.locator('..')
  if (await panel.getAttribute('open') === null) await summary.click()
  return scope
}

export async function revealEditorActions<T extends Locator | Page>(scope: T): Promise<T> {
  const summary = scope.locator('details.editor-more > summary').last()
  if (await summary.count() && await summary.locator('..').getAttribute('open') === null) await summary.click()
  return scope
}
