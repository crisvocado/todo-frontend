import {
  initGlobalErrorHandlers,
  uninstallGlobalErrorHandlers,
} from './handlers.js'
import { ErrorBoundary } from './ErrorBoundary.js'
import {
  setLogcoreSender,
  logError,
  createLogEntry,
  sendLogcoreEntries,
} from './client.js'

function initLogcore() {
  return initGlobalErrorHandlers()
}

export {
  ErrorBoundary,
  initLogcore,
  initGlobalErrorHandlers,
  uninstallGlobalErrorHandlers,
  setLogcoreSender,
  logError,
  createLogEntry,
  sendLogcoreEntries,
}
