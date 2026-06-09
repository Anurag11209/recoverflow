import pino, { type Logger } from 'pino';
import prettyFactory from 'pino-pretty';

// Read NODE_ENV directly (not via the validated env) so logging never depends
// on the full environment being valid — you always want logs, even on a misconfig.
const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';
const level = process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug');

const redact = {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    'password',
    '*.password',
    'secret',
    '*.secret',
    'token',
    '*.token',
    'DATABASE_URL',
  ],
  censor: '[redacted]',
};

// Pretty, human-readable logs in development; structured JSON in production.
// pino-pretty is passed as a synchronous stream rather than a transport target,
// because worker-thread transports don't bundle cleanly in Next's server.
export const logger: Logger = isProduction
  ? pino({ level, redact })
  : pino(
      { level, redact },
      prettyFactory({ colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' }),
    );
