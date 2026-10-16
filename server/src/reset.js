// Reset script: drops and recreates the database, then re-seeds it.
// Usage: npm run db:reset   (or: node src/reset.js)
const { main } = require('./seed');

main().catch((err) => {
  console.error('Reset failed:', err.message);
  process.exit(1);
});
