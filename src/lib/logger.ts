type Level = 'debug' | 'info' | 'warn' | 'error'

const isDev = import.meta.env.DEV

function log(level: Level, ...args: unknown[]) {
  if (level === 'debug' && !isDev) return
  // eslint-disable-next-line no-console
  console[level](`[${level.toUpperCase()}]`, ...args)
}

export const logger = {
  debug: (...args: unknown[]) => log('debug', ...args),
  info: (...args: unknown[]) => log('info', ...args),
  warn: (...args: unknown[]) => log('warn', ...args),
  error: (...args: unknown[]) => log('error', ...args),
}
