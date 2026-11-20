import type { z } from 'zod';
import { HttpError } from './errors.js';

export function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const msg = result.error.issues
      .map((i) => `${i.path.join('.') || 'girdi'}: ${i.message}`)
      .join(', ');
    throw new HttpError(400, msg);
  }
  return result.data as z.output<S>;
}

export function nowMs(): number {
  return Date.now();
}
