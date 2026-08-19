import { describe, it, expect } from 'vitest'
import { getCompletedCount } from './App'

describe('getCompletedCount bug fix', () => {
  it('returns completed count instead of uncompleted count when counts differ', () => {
    const todos = [
      { id: 1, title: 'a', completed: true },
      { id: 2, title: 'b', completed: false },
      { id: 3, title: 'c', completed: false },
    ]
    // Completed count is 1. Uncompleted count is 2.
    expect(getCompletedCount(todos)).toBe(1)
  })
})
