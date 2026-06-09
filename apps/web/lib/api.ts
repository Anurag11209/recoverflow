import { NextResponse } from 'next/server';
import { AppError, logger, toErrorResponse } from '@recoverflow/shared';

/**
 * Wraps a Next.js route handler so any thrown error becomes a consistent JSON
 * envelope — { error: { code, message } } — with the right status. Operational
 * 4xx errors log at warn; everything else logs at error with full detail.
 * Unknown errors never leak their message to the client.
 */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response> | Response,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      if (err instanceof AppError && err.isOperational && err.status < 500) {
        logger.warn({ code: err.code }, err.message);
      } else {
        logger.error({ err }, err instanceof Error ? err.message : 'Unhandled route error');
      }
      return NextResponse.json(body, { status });
    }
  };
}
