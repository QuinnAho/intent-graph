// One-time DB initialization: backup-before-migrate (refuses to start if
// backup write fails), apply migrations, attach sqlite-vec, then apply
// pragmas on every fresh connection:
//   journal_mode=WAL, synchronous=NORMAL, mmap_size=268435456,
//   temp_store=MEMORY, foreign_keys=ON, busy_timeout=5000

export const DB_INIT_PLACEHOLDER = 'db-init';
