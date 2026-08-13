import { describe, it, expect } from 'vitest'
import { getCompletedCount } from './App'

describe('getCompletedCount regression test for stats validation mismatch', () => {
  it('returns actual completed count to prevent stats validation error', () => {
    const todos = [
      { id: 1, title: 'Task 1', completed: true },
      { id: 2, title: 'Task 2', completed: false },
      { id: 3, title: 'Task 3', completed: false },
    ]
    const expectedCompletedCount = 1
    const actualCompletedCount = todos.filter((t) => t.completed).length
    expect(getCompletedCount(todos)).toBe(expectedCompletedCount)
    expect(getCompletedCount(todos)).toBe(actualCompletedCount)
  })
})
