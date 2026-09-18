/**
 * Logcore HTTP client and log entry builder for frontend applications.
 *
 * Implements the Logcore HTTP transport contract:
 * - Top-level wire shape (timestamp, severity, message, service, env, insert_id, error, etc.)
 * - Deterministic 32-char SHA-256 insert_id
 * - Parsed stack trace frames (innermost first, root cause first, inApp flag)
 * - Safe fire-and-forget delivery via fetch that never throws or disrupts the application
 */

// Pure JS SHA-256 implementation to compute deterministic insert_id synchronously without dependencies
function sha256(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i, j;
  let result = '';

  const words = [];
  const asciiBitLength = ascii.length * 8;

  let hash = [];
  let k = [];
  let primeCounter = 0;

  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  hash = hash.slice(0, 8);

  words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
  words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;

  for (i = 0; i < ascii.length; i++) {
    words[i >> 2] |= ascii.charCodeAt(i) << ((3 - (i % 4)) * 8);
  }

  for (j = 0; j < words.length; j += 16) {
    const w = words.slice(j, j + 16);
    const oldHash = hash.slice(0);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];

      const a = hash[0], e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? (w[i] | 0)
            : ((w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0));

      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash = [(temp1 + temp2) | 0, a, hash[1], hash[2], (hash[3] + temp1) | 0, hash[4], hash[5], hash[6]];
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

/**
 * Reads an environment variable supporting Vite (import.meta.env) and Node (process.env).
 */
export function getEnv(key) {
  const prefixedKey = `VITE_${key}`;
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      if (import.meta.env[prefixedKey] !== undefined) return import.meta.env[prefixedKey];
      if (import.meta.env[key] !== undefined) return import.meta.env[key];
    }
  } catch {
    // Ignore environment read errors
  }
  try {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env[prefixedKey] !== undefined) return process.env[prefixedKey];
      if (process.env[key] !== undefined) return process.env[key];
    }
  } catch {
    // Ignore environment read errors
  }
  return undefined;
}

/**
 * Normalizes the environment string to one of the platform-allowed enums:
 * 'prod' | 'staging' | 'dev' | 'test' | 'local'
 */
function normalizeEnv(rawEnv) {
  if (!rawEnv) return 'dev';
  const val = String(rawEnv).toLowerCase().trim();
  if (val === 'production' || val === 'prod') return 'prod';
  if (val === 'staging' || val === 'stage') return 'staging';
  if (val === 'test' || val === 'testing') return 'test';
  if (val === 'local' || val === 'localhost') return 'local';
  return 'dev';
}

/**
 * Retrieves the active Logcore logging configuration.
 */
export function getLoggingConfig() {
  const enabledVal = getEnv('LOGCORE_ENABLED');
  const enabled = enabledVal === undefined ? true : enabledVal !== 'false' && enabledVal !== false;
  const endpoint = getEnv('LOGCORE_URL') || 'https://logcore-dev-352942961463.us-east4.run.app';
  const apiKey = getEnv('LOGCORE_KEY') || '';
  const service = getEnv('LOGCORE_SERVICE') || 'todo-frontend';
  const env = normalizeEnv(getEnv('LOGCORE_ENV') || getEnv('MODE'));

  return {
    enabled,
    endpoint,
    apiKey,
    service,
    env,
  };
}

/**
 * Determines whether a file path belongs to application source code (inApp: true)
 * or external dependencies/frameworks (inApp: false).
 */
function isInApp(file) {
  if (!file) return true;
  if (file.includes('node_modules')) return false;
  if (file.includes('cdn.') || file.includes('/vendor') || file.includes('vendor.js')) return false;
  if (file.includes('react-dom') || file.includes('@vite') || file.includes('/@fs/')) return false;
  return true;
}

/**
 * Parses raw stack trace string into structured frames.
 */
export function parseStackTrace(stack) {
  if (!stack || typeof stack !== 'string') return [];
  const lines = stack.split('\n');
  const frames = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Pattern 1: V8 "at functionName (file:line:col)"
    const matchWithFunc = trimmed.match(/^at\s+(?:async\s+)?(.+?)\s+\((.+?):(\d+):(\d+)\)$/);
    if (matchWithFunc) {
      frames.push({
        function: matchWithFunc[1],
        file: matchWithFunc[2],
        line: parseInt(matchWithFunc[3], 10),
        column: parseInt(matchWithFunc[4], 10),
        inApp: isInApp(matchWithFunc[2]),
      });
      continue;
    }

    // Pattern 2: V8 "at file:line:col" (anonymous function)
    const matchWithoutFunc = trimmed.match(/^at\s+(?:async\s+)?(.+?):(\d+):(\d+)$/);
    if (matchWithoutFunc) {
      frames.push({
        function: '<anon>',
        file: matchWithoutFunc[1],
        line: parseInt(matchWithoutFunc[2], 10),
        column: parseInt(matchWithoutFunc[3], 10),
        inApp: isInApp(matchWithoutFunc[1]),
      });
      continue;
    }

    // Pattern 3: Firefox/Safari "func@file:line:col" or "@file:line:col"
    const ffMatch = trimmed.match(/^(?:(.*?)@)?(.+?):(\d+):(\d+)$/);
    if (ffMatch) {
      frames.push({
        function: ffMatch[1] || '<anon>',
        file: ffMatch[2],
        line: parseInt(ffMatch[3], 10),
        column: parseInt(ffMatch[4], 10),
        inApp: isInApp(ffMatch[2]),
      });
      continue;
    }
  }
  return frames;
}

/**
 * Collects parsed stack frames along the error cause chain (innermost/root cause first).
 */
function collectStackFrames(err) {
  if (!err) return [];
  const chain = [];
  let current = err;
  const visited = new Set();
  while (current && !visited.has(current)) {
    visited.add(current);
    chain.push(current);
    current = current.cause;
  }
  // Root cause first
  chain.reverse();
  const allFrames = [];
  for (const item of chain) {
    if (item && item.stack) {
      allFrames.push(...parseStackTrace(item.stack));
    }
  }
  // Clamp to at most 50 frames
  return allFrames.slice(0, 50);
}

/**
 * Computes deterministic 32-char insert_id for deduplication.
 */
export function computeInsertId(timestamp, service, severity, message, context) {
  const canonicalContext = context ? JSON.stringify(context, Object.keys(context).sort()) : '{}';
  const raw = [timestamp, service, severity, message, canonicalContext].join('|');
  const utf8 = encodeURIComponent(raw).replace(/%([0-9A-F]{2})/g, (_, p1) =>
    String.fromCharCode(parseInt(p1, 16))
  );
  return sha256(utf8).slice(0, 32);
}

/**
 * Formats the ingest URL from the base endpoint.
 */
export function getIngestUrl(endpoint) {
  if (!endpoint) return '';
  const clean = endpoint.replace(/\/+$/, '');
  return clean.endsWith('/v1/logs') ? clean : `${clean}/v1/logs`;
}

/**
 * Builds a structured log entry matching the Logcore snippet contract.
 */
export function buildLogEntry({
  message,
  severity = 'ERROR',
  error,
  labels,
  context,
  trace,
  service,
  env,
  timestamp,
}) {
  const config = getLoggingConfig();
  const resolvedTimestamp = timestamp || new Date().toISOString();
  const resolvedService = service || config.service;
  const resolvedEnv = env || config.env;
  const resolvedMessage = String(message || (error && error.message) || 'Unknown error').slice(0, 65536);

  const insertId = computeInsertId(
    resolvedTimestamp,
    resolvedService,
    severity,
    resolvedMessage,
    context
  );

  const entry = {
    timestamp: resolvedTimestamp,
    severity: severity || 'ERROR',
    message: resolvedMessage,
    service: resolvedService,
    env: resolvedEnv,
    insert_id: insertId,
  };

  if (trace && typeof trace === 'object') {
    entry.trace = trace;
  }

  if (error) {
    const errorObj = typeof error === 'object' ? error : new Error(String(error));
    const stackFrames = collectStackFrames(errorObj);
    entry.error = {
      type: errorObj.name || errorObj.constructor?.name || 'Error',
      message: String(errorObj.message || errorObj).slice(0, 65536),
      stack: stackFrames,
    };
  }

  if (labels && typeof labels === 'object') {
    const clampedLabels = {};
    const keys = Object.keys(labels).slice(0, 32);
    for (const k of keys) {
      clampedLabels[k] = String(labels[k]).slice(0, 1024);
    }
    entry.labels = clampedLabels;
  }

  if (context && typeof context === 'object') {
    entry.context = context;
  }

  return entry;
}

/**
 * Sends a log entry via HTTP envelope to the Logcore gateway.
 * Fire-and-forget: swallows all network errors and never throws.
 */
export async function sendRecord(entry, options = {}) {
  const config = getLoggingConfig();
  if (!config.enabled && !options.force) {
    return;
  }

  const endpoint = options.endpoint || config.endpoint;
  const apiKey = options.apiKey !== undefined ? options.apiKey : config.apiKey;
  const ingestUrl = getIngestUrl(endpoint);

  const envelope = {
    schema_version: 1,
    entries: [entry],
  };

  if (options.sendFn) {
    try {
      return await options.sendFn(ingestUrl, envelope);
    } catch {
      return;
    }
  }

  if (!ingestUrl) return;

  try {
    if (typeof fetch === 'function') {
      const headers = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['x-api-key'] = apiKey;
      }

      await fetch(ingestUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(envelope),
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Swallow transport errors: logging must never crash or block the application
  }
}

/**
 * Captures an error and delivers it to Logcore.
 */
export async function captureError(error, options = {}) {
  try {
    const entry = buildLogEntry({
      message: options.message || (error && error.message) || 'Error captured',
      severity: options.severity || 'ERROR',
      error,
      labels: options.labels,
      context: options.context,
      trace: options.trace,
      service: options.service,
      env: options.env,
      timestamp: options.timestamp,
    });
    return await sendRecord(entry, options);
  } catch {
    // Logging must never break the caller
  }
}

/**
 * Logs a standalone error message to Logcore.
 */
export async function logError(message, options = {}) {
  return captureError(new Error(message), { ...options, message });
}
