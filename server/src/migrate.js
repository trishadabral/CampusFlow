// Applies pending database migrations without wiping data.
// Usage: npm run db:migrate   (fresh install? use npm run db:reset instead)
const { migrate } = require('./dbms/migrations');

migrate()
  .then((applied) => {
    if (applied.length === 0) {
      console.log('Database is already up to date — no pending migrations.');
    } else {
      console.log(`Applied ${applied.length} migration(s): ${applied.join(', ')}`);
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
  });
