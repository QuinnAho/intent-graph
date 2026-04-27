// SQLite connection pool (1 writer / N readers) wrapping better-sqlite3 +
// Drizzle. Acts as the storage port abstraction so libSQL/LanceDB can swap
// in later without touching graph operations.

export const DB_CLIENT_PLACEHOLDER = 'db-client';
