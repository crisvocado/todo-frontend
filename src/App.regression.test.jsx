import { describe, it, expect } from 'vitest'
import { getCompletedCount } from './App'

describe('getCompletedCount regression', () => {
  it('returns count of completed todos rather than incomplete ones', () => {
    const todos = [
      { id: 1, title: 'completed task', completed: true },
      { id: 2, title: 'incomplete task 1', completed: false },
      { id: 3, title: 'incomplete task 2', completed: false },
    ]
    expect(getCompletedCount(todos)).toBe(1)
  })
})
