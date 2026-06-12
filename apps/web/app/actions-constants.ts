/**
 * ACCESS_LEVELS Phase 6.2: thrown when BFF returns 403 (permission denied / no view).
 * Only 403 is mapped to this; 401 (unauthorized) is not — 401 has a separate flow (login).
 * Other errors are rethrown (not masked). Client must catch and show "Немає доступу", not rethrow.
 * Kept in a separate file so "use server" modules only export async functions.
 */
export const ACCESS_DENIED_MESSAGE = "ACCESS_DENIED";
