import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ErrorBoundary } from './logcore/ErrorBoundary.jsx'
import { installGlobalHandlers } from './logcore/global-handlers.js'
import { installFetchLogging } from './logcore/fetch-instrumentation.js'

installGlobalHandlers()
installFetchLogging()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
