// Lab status — what the C++ lab agent last reported, for the scheduler.
//
// The test-session scheduler (os/pipeline.js) uses this only as a
// PREFERENCE: labs with more recently-reported free machines go first.
// When the agent has never run, this returns an empty map and scheduling
// behaves exactly as before (capacity-only). A failure here must never
// break scheduling, so callers should catch and fall back to {}.

const STALE_MINUTES = 5;

// { resourceId: freeCount } — free machines reported within the last
// 5 minutes. Machines that went quiet are not counted: they may be down.
async function freeMachineCounts(conn) {
  const [rows] = await conn.query(
    `SELECT resource_id, COUNT(*) AS free_count
     FROM lab_machines
     WHERE status = 'free' AND last_seen >= NOW() - INTERVAL ? MINUTE
     GROUP BY resource_id`,
    [STALE_MINUTES]
  );
  const counts = {};
  for (const r of rows) counts[r.resource_id] = Number(r.free_count);
  return counts;
}

module.exports = { freeMachineCounts, STALE_MINUTES };
