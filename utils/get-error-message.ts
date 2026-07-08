// Supabase's Postgrest/Storage errors are real Error subclasses, so
// `err instanceof Error` normally holds — but this is defensive against
// anything thrown that merely looks like an error (a plain
// { message: string } shape) rather than silently falling back to a generic
// message and hiding what actually happened.
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object' && err !== null) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}
