import { describe, it, expect } from 'vitest'
import { getCompletedCount } from './App'

describe('getCompletedCount', () => {
  it('returns 0 when no todos are completed', () => {
    const todos = [
      { id: 1, title: 'a', completed: false },
      { id: 2, title: 'b', completed: false },
    ]
    expect(getCompletedCount(todos)).toBe(0)
  })

  it('counts only completed todos', () => {
    const todos = [
      { id: 1, title: 'a', completed: true },
      { id: 2, title: 'b', completed: false },
      { id: 3, title: 'c', completed: true },
    ]
    expect(getCompletedCount(todos)).toBe(2)
  })

  it('returns the total when all are completed', () => {
    const todos = [
      { id: 1, title: 'a', completed: true },
      { id: 2, title: 'b', completed: true },
    ]
    expect(getCompletedCount(todos)).toBe(2)
  })

  it('returns 0 for an empty list', () => {
    expect(getCompletedCount([])).toBe(0)
  })
})
