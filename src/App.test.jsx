import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App, { getCompletedCount, nextTaskLabel } from './App'

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

describe('nextTaskLabel', () => {
  it('returns the title of the first uncompleted task', () => {
    const todos = [
      { id: 1, title: 'first', completed: true },
      { id: 2, title: 'second', completed: false },
      { id: 3, title: 'third', completed: false },
    ]
    expect(nextTaskLabel(todos)).toBe('second')
  })

  it('returns undefined when all todos are completed', () => {
    const todos = [
      { id: 1, title: 'a', completed: true },
      { id: 2, title: 'b', completed: true },
    ]
    expect(nextTaskLabel(todos)).toBeUndefined()
  })

  it('returns undefined for an empty list', () => {
    expect(nextTaskLabel([])).toBeUndefined()
  })
})

describe('App rendering', () => {
  it('renders without crashing when all todos are completed', async () => {
    const mockTodos = [
      { id: 1, title: 'Task 1', completed: true },
      { id: 2, title: 'Task 2', completed: true },
    ]
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockTodos,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('0 pendientes')).toBeTruthy()
    })
    expect(screen.queryByText(/Sigue ·/)).toBeNull()
  })

  it('renders nextTaskLabel eyebrow when uncompleted tasks exist', async () => {
    const mockTodos = [
      { id: 1, title: 'Task 1', completed: true },
      { id: 2, title: 'Task 2', completed: false },
    ]
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockTodos,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('1 pendiente')).toBeTruthy()
    })
    expect(screen.getByText('Sigue · Task 2')).toBeTruthy()
  })
})
