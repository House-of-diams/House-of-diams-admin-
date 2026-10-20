import assert from 'node:assert/strict'
import test from 'node:test'
import { confirmLeaveIfUnsaved, guardNavigation, hasUnsavedChanges } from '../hooks/use-unsaved-changes.ts'

// HOD-056: with no editor holding unsaved changes, navigation never prompts.
test('navigation guard is silent when nothing is unsaved', () => {
  let asked = 0
  globalThis.window = { confirm: () => { asked++; return false } }
  try {
    assert.equal(hasUnsavedChanges(), false)
    assert.equal(confirmLeaveIfUnsaved(), true)
    let prevented = false
    guardNavigation({ preventDefault: () => { prevented = true } })
    assert.equal(prevented, false)
    assert.equal(asked, 0, 'no confirm dialog without unsaved work')
  } finally { delete globalThis.window }
})
