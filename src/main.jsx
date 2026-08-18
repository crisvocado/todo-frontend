import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './logcore/ErrorBoundary.jsx'
import { installGlobalErrorHandlers } from './logcore/globalHandlers'
import { installFetchLogging } from './logcore/fetchInstrumentation'

installGlobalErrorHandlers()
installFetchLogging()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
