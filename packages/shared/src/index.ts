// Shared package — common utility types and helpers used across packages
// No business logic allowed here — only generic utilities

export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };

export function success<T>(data: T): Result<T> {
  return { success: true, data };
}

export function failure<E = Error>(error: E): Result<never, E> {
  return { success: false, error };
}