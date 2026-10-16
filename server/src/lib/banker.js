// Banker's-algorithm safety check for resource allocation.
//
// Resource TYPES (not individual resources) are the "resource classes":
//   lab         -> measured in seats       (total = SUM(capacity) of available labs)
//   room        -> measured in units       (total = COUNT of available rooms)
//   interviewer -> measured in units       (total = COUNT of available interviewers)
//
// A request {resource_id, seats_needed} is mapped onto type demand:
//   lab         -> lab_seats = seats_needed
//   room        -> rooms = 1
//   interviewer -> interviewers = 1
//
// The check refuses the request (409 + explanation) when:
//   1. the same resource is already booked in that window (double-booking), or
//   2. granting it would push any type below zero, or
//   3. the resulting state is *unsafe*: some future slot's implied demand
//      could no longer be satisfied in ANY order (classic safe-sequence test).

function unsafe(error, explanation) {
  const err = new Error(error);
  err.status = 409;
  err.explanation = explanation;
  return err;
}

function describeDemand(d) {
  const parts = [];
  if (d.lab) parts.push(`${d.lab} lab seat${d.lab === 1 ? '' : 's'}`);
  if (d.room) parts.push(`${d.room} room${d.room === 1 ? '' : 's'}`);
  if (d.interviewer) parts.push(`${d.interviewer} interviewer${d.interviewer === 1 ? '' : 's'}`);
  return parts.join(', ') || 'nothing';
}

async function checkAllocation(pool, { resource_id, seats_needed = 1, starts_at, ends_at }) {
  // --- 0) resource must exist and be usable ---
  const [rRows] = await pool.query('SELECT * FROM resources WHERE id = ?', [resource_id]);
  const resource = rRows[0];
  if (!resource) throw unsafe('Resource not found.', 'No resource exists with that id.');
  if (resource.status !== 'available') {
    throw unsafe(
      'Resource is currently under maintenance.',
      `Resource '${resource.name}' is marked as ${resource.status} and cannot be allocated.`
    );
  }

  // --- map the request onto resource-type demand ---
  const request = { lab: 0, room: 0, interviewer: 0 };
  if (resource.type === 'lab') request.lab = Math.max(1, Number(seats_needed) || 1);
  else if (resource.type === 'room') request.room = 1;
  else request.interviewer = 1;

  // --- 1) per-resource overlap: one resource, one booking at a time ---
  const [overlap] = await pool.query(
    `SELECT id FROM allocations
     WHERE resource_id = ? AND starts_at < ? AND ends_at > ? LIMIT 1`,
    [resource_id, ends_at, starts_at]
  );
  if (overlap.length) {
    throw unsafe(
      'Resource already booked in that window.',
      `Resource '${resource.name}' already has an allocation overlapping that time window.`
    );
  }

  // --- 2) totals per type (only usable resources count) ---
  const [totals] = await pool.query(
    `SELECT type, SUM(CASE WHEN type = 'lab' THEN capacity ELSE 1 END) AS total
     FROM resources WHERE status = 'available' GROUP BY type`
  );
  const total = { lab: 0, room: 0, interviewer: 0 };
  for (const t of totals) total[t.type] = Number(t.total);

  // --- 3) current allocation overlapping the requested window, per type ---
  const [alloc] = await pool.query(
    `SELECT r.type, SUM(CASE WHEN r.type = 'lab' THEN a.seats_needed ELSE 1 END) AS used
     FROM allocations a JOIN resources r ON r.id = a.resource_id
     WHERE a.starts_at < ? AND a.ends_at > ?
     GROUP BY r.type`,
    [ends_at, starts_at]
  );
  const used = { lab: 0, room: 0, interviewer: 0 };
  for (const a of alloc) used[a.type] = Number(a.used);

  // --- 4) tentative grant: every type must stay non-negative ---
  const remaining = {
    lab: total.lab - used.lab - request.lab,
    room: total.room - used.room - request.room,
    interviewer: total.interviewer - used.interviewer - request.interviewer,
  };
  for (const t of ['lab', 'room', 'interviewer']) {
    if (remaining[t] < 0) {
      throw unsafe(
        'Allocation refused: unsafe state.',
        `Granting ${describeDemand(request)} on '${resource.name}' would over-allocate ${t} ` +
          `(only ${total[t] - used[t]} still free).`
      );
    }
  }

  // --- 5) pending demands: every upcoming slot implies future resource needs ---
  // Each slot will need lab seats = its capacity, 1 room, and interviewers = ceil(capacity/20).
  const [slots] = await pool.query(
    'SELECT id, title, capacity FROM slots WHERE starts_at >= ? ORDER BY starts_at',
    [starts_at]
  );
  const demands = slots.map((s) => ({
    label: `slot '${s.title}'`,
    need: {
      lab: Number(s.capacity),
      room: 1,
      interviewer: Math.max(1, Math.ceil(Number(s.capacity) / 20)),
    },
  }));

  // --- 6) classic Banker's safe-sequence over the pending demands ---
  // Work = what is left after the tentative grant. A pending demand holds
  // nothing yet: if it fits in Work it can "run", and running releases
  // everything (Work unchanged). If no remaining demand ever fits, the
  // state is unsafe and the request is refused.
  const work = { ...remaining };
  const pending = [...demands];
  let progressed = true;
  while (pending.length && progressed) {
    progressed = false;
    for (let i = 0; i < pending.length; i++) {
      const d = pending[i];
      if (d.need.lab <= work.lab && d.need.room <= work.room && d.need.interviewer <= work.interviewer) {
        pending.splice(i, 1);
        i--;
        progressed = true;
      }
    }
  }
  if (pending.length) {
    const blocker = pending[0];
    const lacking = ['lab', 'room', 'interviewer']
      .filter((t) => blocker.need[t] > work[t])
      .map((t) => `${blocker.need[t]} ${t === 'lab' ? 'lab seats' : t + 's'}`)
      .join(', ');
    throw unsafe(
      'Allocation refused: unsafe state.',
      `Granting ${describeDemand(request)} on '${resource.name}' would leave only ` +
        `${describeDemand(work)} available; ${blocker.label} needs ${lacking} ` +
        `and could no longer be satisfied.`
    );
  }

  return { resource, request, remaining };
}

module.exports = { checkAllocation };
