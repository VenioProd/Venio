import pino, { type LoggerOptions } from 'pino'

const isProd = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'
const level = process.env.LOG_LEVEL || (isProd ? 'info' : isTest ? 'warn' : 'debug')

const options: LoggerOptions = {
  level,
  base: { service: 'venio-backend' },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'password', 'passwordHash', 'plainPassword', 'token', '*.token', '*.password'],
    censor: '[REDACTED]',
  },
}

// En dev local : pretty-print pour la lisibilité (pas en prod, où on émet du JSON structuré).
const transport = !isProd && !isTest
  ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname,service' } }
  : undefined

export const logger = pino({ ...options, transport })

export default logger
