import { describe, expect, it } from 'vitest';
import { AppError, NotFoundError, ValidationError, toErrorResponse } from './errors';

describe('AppError', () => {
  it('applies sensible defaults', () => {
    const e = new AppError('boom');
    expect(e.code).toBe('INTERNAL_ERROR');
    expect(e.status).toBe(500);
    expect(e.isOperational).toBe(true);
    expect(e.name).toBe('AppError');
    expect(e).toBeInstanceOf(Error);
  });
  it('preserves the cause', () => {
    const cause = new Error('root');
    expect(new AppError('wrap', { cause }).cause).toBe(cause);
  });
});

describe('subclasses', () => {
  it('NotFoundError -> 404 / NOT_FOUND', () => {
    const e = new NotFoundError();
    expect(e.status).toBe(404);
    expect(e.code).toBe('NOT_FOUND');
    expect(e).toBeInstanceOf(AppError);
  });
  it('ValidationError -> 400 / VALIDATION_ERROR', () => {
    const e = new ValidationError('bad input');
    expect(e.status).toBe(400);
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(e.message).toBe('bad input');
  });
});

describe('toErrorResponse', () => {
  it('maps an AppError to its status + serialized body', () => {
    expect(toErrorResponse(new NotFoundError('no merchant'))).toEqual({
      status: 404,
      body: { error: { code: 'NOT_FOUND', message: 'no merchant' } },
    });
  });
  it('maps an unknown error to a generic 500 (no leakage)', () => {
    expect(toErrorResponse(new Error('leak me'))).toEqual({
      status: 500,
      body: { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
    });
  });
});
