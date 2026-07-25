import { useState, useEffect } from 'react'
import './App.css'

const API_URL = 'http://localhost:8010'

function App() {
  const [todos, setTodos] = useState([])
  const [newTitle, setNewTitle] = useState('')

  useEffect(() => {
    fetchTodos()
  }, [])

  async function fetchTodos() {
    const res = await fetch(`${API_URL}/todos`)
    const data = await res.json()
    setTodos(data)
  }

  async function addTodo(e) {
    e.preventDefault()
    if (!newTitle.trim()) return
    await fetch(`${API_URL}/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim() }),
    })
    setNewTitle('')
    fetchTodos()
  }

  async function toggleTodo(todo) {
    await fetch(`${API_URL}/todos/${todo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !todo.completed }),
    })
    fetchTodos()
  }

  async function deleteTodo(id) {
    await fetch(`${API_URL}/todos/${id}`, { method: 'DELETE' })
    fetchTodos()
  }

  return (
    <div className="app">
      <h1>TODO App</h1>

      <form onSubmit={addTodo} className="add-form">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="What needs to be done?"
        />
        <button type="submit">Add</button>
      </form>

      <ul className="todo-list">
        {todos.map((todo) => (
          <li key={todo.id} className={todo.completed ? 'completed' : ''}>
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => toggleTodo(todo)}
            />
            <span>{todo.title}</span>
            <button onClick={() => deleteTodo(todo.id)} className="delete-btn">
              ×
            </button>
          </li>
        ))}
      </ul>

      {todos.length === 0 && <p className="empty">No todos yet. Add one above!</p>}
    </div>
  )
}

export default App
