import { Component } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, it, expect, vi } from 'vitest'
import App, { getCompletedCount, nextTaskLabel } from './App'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

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
  it('returns the title of the first pending task', () => {
    const todos = [
      { id: 1, title: 'a', completed: true },
      { id: 2, title: 'b', completed: false },
      { id: 3, title: 'c', completed: false },
    ]
    expect(nextTaskLabel(todos)).toBe('b')
  })

  it('reproduces the requested demo TypeError when all tasks are completed', () => {
    const todos = [
      { id: 1, title: 'a', completed: true },
      { id: 2, title: 'b', completed: true },
    ]
    expect(() => nextTaskLabel(todos)).toThrow(TypeError)
    expect(() => nextTaskLabel(todos)).toThrow(/title/)
  })

  it('throws for an empty list when called directly', () => {
    expect(() => nextTaskLabel([])).toThrow(TypeError)
  })
})

// Test-only boundary: the app itself intentionally has no error interception.
class CaptureRenderError extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    return this.state.error
      ? <p role="alert">{this.state.error.name}: {this.state.error.message}</p>
      : this.props.children
  }
}

describe('requested nextTaskLabel demo scenario', () => {
  function loadTodos(todos) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => todos,
    }))
    render(<CaptureRenderError><App /></CaptureRenderError>)
  }

  it('renders the next task while a pending task exists', async () => {
    loadTodos([{ id: 1, title: 'Comprar café', completed: false }])
    expect(await screen.findByText('Sigue · Comprar café')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('reproduces the render failure after loading only completed tasks', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    loadTodos([{ id: 1, title: 'Comprar café', completed: true }])
    const error = await screen.findByRole('alert')
    expect(error.textContent).toMatch(/TypeError:.*title/)
  })

  it('keeps an empty task list renderable without calling nextTaskLabel', async () => {
    loadTodos([])
    expect(await screen.findByText('Escribe la primera tarea arriba.')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
