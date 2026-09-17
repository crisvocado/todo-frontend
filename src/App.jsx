import { useState, useEffect, useMemo, useRef } from 'react'
import './App.css'

const API_URL = 'https://todo-api-1038835828100.us-central1.run.app'

const EXIT_MS = 260

export function getCompletedCount(todos) {
  return todos.filter((t) => t.completed).length
}

export function nextTaskLabel(todos) {
  return todos.find((task) => !task.completed).title
}

function App() {
  const [todos, setTodos] = useState([])
  const [newTitle, setNewTitle] = useState('')
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [notice, setNotice] = useState('')
  const [adding, setAdding] = useState(false)
  const [leaving, setLeaving] = useState([])
  const [stagger, setStagger] = useState(true)
  const firstLoad = useRef(true)

  useEffect(() => {
    fetchTodos()
  }, [])

  const today = useMemo(
    () =>
      new Intl.DateTimeFormat('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(new Date()),
    [],
  )

  const done = todos.filter((t) => t.completed).length
  const pending = todos.length - done

  async function fetchTodos() {
    try {
      const res = await fetch(`${API_URL}/todos`)
      if (!res.ok) throw new Error(`GET /todos responded ${res.status}`)
      const data = await res.json()
      setTodos(data)
      setStatus('ready')
      setNotice('')
      if (firstLoad.current) {
        firstLoad.current = false
        setTimeout(() => setStagger(false), 900)
      }
    } catch {
      // Si ya hay lista en pantalla no se sustituye por un panel de error: se
      // deja la lista y se avisa. El panel es solo para la carga inicial.
      setStatus((prev) => (prev === 'ready' ? 'ready' : 'error'))
      setNotice((prev) => prev || 'No se pudo actualizar la lista.')
    }
  }

  async function addTodo(e) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title || adding) return
    setAdding(true)
    setNotice('')
    try {
      const res = await fetch(`${API_URL}/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      if (!res.ok) throw new Error(`POST /todos responded ${res.status}`)
      setNewTitle('')
      await fetchTodos()
    } catch {
      setNotice('No se pudo guardar la tarea. Vuelve a intentarlo.')
    } finally {
      setAdding(false)
    }
  }

  // Optimista a propósito: el tachado tiene que dibujarse en el momento del
  // clic, no cuando responde la red. Si falla, se revierte y se avisa.
  async function toggleTodo(todo) {
    const next = !todo.completed
    setTodos((prev) =>
      prev.map((t) => (t.id === todo.id ? { ...t, completed: next } : t)),
    )
    setNotice('')
    try {
      const res = await fetch(`${API_URL}/todos/${todo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: next }),
      })
      if (!res.ok) throw new Error(`PATCH /todos responded ${res.status}`)
      await fetchTodos()
    } catch {
      setTodos((prev) =>
        prev.map((t) => (t.id === todo.id ? { ...t, completed: !next } : t)),
      )
      setNotice('No se pudo guardar el cambio. Revisa la conexión.')
    }
  }

  async function deleteTodo(id) {
    setLeaving((prev) => [...prev, id])
    setNotice('')
    await new Promise((resolve) => setTimeout(resolve, EXIT_MS))
    try {
      const res = await fetch(`${API_URL}/todos/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`DELETE /todos responded ${res.status}`)
      await fetchTodos()
    } catch {
      setNotice('No se pudo eliminar la tarea. Vuelve a intentarlo.')
    } finally {
      setLeaving((prev) => prev.filter((leavingId) => leavingId !== id))
    }
  }

  return (
    <div className="page">
      <main className="sheet">
        <header className="masthead">
          <p className="eyebrow">
            <span className="eyebrow-date">{today}</span>
            <span className="eyebrow-sep" aria-hidden="true">/</span>
            <span className="eyebrow-count">
              {pending === 1 ? '1 pendiente' : `${pending} pendientes`}
            </span>
            {todos.length > 0 && (
              <>
                <span className="eyebrow-sep" aria-hidden="true">/</span>
                <span className="eyebrow-next">Sigue · {nextTaskLabel(todos)}</span>
              </>
            )}
          </p>

          <div className="masthead-row">
            <h1 className="title">Hoy</h1>

            <div className="tally" aria-live="polite">
              <p className="tally-figure">
                <span className="tally-done">{done}</span>
                <span className="tally-slash" aria-hidden="true">/</span>
                <span className="tally-total">{todos.length}</span>
                <span className="tally-label">hechas</span>
              </p>
              {/* Un segmento por tarea: la barra cuenta, no estima. */}
              <div
                className="meter"
                role="img"
                aria-label={`${done} de ${todos.length} tareas hechas`}
              >
                {todos.length === 0 && <span className="meter-empty" />}
                {todos.map((todo) => (
                  <span
                    key={todo.id}
                    className={`meter-seg${todo.completed ? ' is-done' : ''}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </header>

        <form onSubmit={addTodo} className="composer">
          <span className="composer-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <input
            className="composer-input"
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Escribe una tarea"
            aria-label="Nueva tarea"
            enterKeyHint="done"
          />
          <button type="submit" className="composer-submit" disabled={adding}>
            {adding ? 'Guardando' : 'Añadir'}
          </button>
        </form>

        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}

        {status === 'loading' && (
          <ul className="skeleton" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li key={i} style={{ '--i': i }}>
                <span className="skeleton-box" />
                <span className="skeleton-line" />
              </li>
            ))}
          </ul>
        )}

        {status === 'error' && (
          <div className="panel" role="alert">
            <p className="panel-title">No se pudo cargar la lista.</p>
            <p className="panel-body">
              El servidor de tareas no respondió. Vuelve a intentarlo.
            </p>
            <button
              type="button"
              className="panel-action"
              onClick={() => {
                setNotice('')
                setStatus('loading')
                fetchTodos()
              }}
            >
              Reintentar
            </button>
          </div>
        )}

        {status === 'ready' && todos.length === 0 && (
          <p className="empty">
            Todo despejado. <span>Escribe la primera tarea arriba.</span>
          </p>
        )}

        {status === 'ready' && todos.length > 0 && (
          <ul className={`list${stagger ? ' is-entering' : ''}`}>
            {todos.map((todo, i) => (
              <li
                key={todo.id}
                className={`task${todo.completed ? ' is-done' : ''}${
                  leaving.includes(todo.id) ? ' is-leaving' : ''
                }`}
                style={{ '--i': i }}
              >
                <label className="task-check">
                  <input
                    type="checkbox"
                    checked={todo.completed}
                    onChange={() => toggleTodo(todo)}
                  />
                  <span className="task-box" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path
                        d="M5 12.5 10.5 18 19 7"
                        pathLength="1"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="task-body">
                    <span className="task-text">{todo.title}</span>
                  </span>
                </label>

                <button
                  type="button"
                  onClick={() => deleteTodo(todo.id)}
                  className="task-delete"
                  aria-label={`Eliminar «${todo.title}»`}
                >
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M7 7l10 10M17 7L7 17"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}

        <footer className="footer">
          <p className="stats">
            {todos.length} en total · {getCompletedCount(todos)} completadas
          </p>
          <button
            type="button"
            className="demo-trigger"
            onClick={async () => {
              try {
                await fetch(`${API_URL}/trigger-error`, { method: 'POST' })
              } catch {
                // Backend error — logged server-side via ablock-logger Python
              }
            }}
          >
            Provocar error 500
          </button>
        </footer>
      </main>
    </div>
  )
}

export default App
