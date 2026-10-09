import {
  initLogcore,
  setLogcoreSender,
  uninstallGlobalErrorHandlers,
} from './logcore/index.js'

async function runProbe() {
  let capturedEnvelope = null

  // Capture callback at the network send boundary
  setLogcoreSender((envelope) => {
    capturedEnvelope = envelope
  })

  // Initialize application's logging setup
  initLogcore()

  // Suppress original console.error stderr output during probe execution
  const originalStderrWrite = process.stderr.write
  process.stderr.write = () => true

  try {
    // Trigger an ERROR with existing logger (console.error)
    const sampleError = new TypeError(
      "Cannot read properties of undefined (reading 'title')",
    )
    console.error('Unhandled task render failure', sampleError)
  } finally {
    process.stderr.write = originalStderrWrite
    uninstallGlobalErrorHandlers()
    setLogcoreSender(null)
  }

  if (!capturedEnvelope) {
    process.stderr.write('Error: probe captured no logcore emission\n')
    process.exit(1)
  }

  // Print the complete HTTP request envelope unchanged to stdout
  process.stdout.write(JSON.stringify(capturedEnvelope) + '\n')
  process.exit(0)
}

runProbe()
