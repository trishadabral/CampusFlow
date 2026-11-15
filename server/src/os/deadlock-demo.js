// Deadlock demo — a guided, in-memory teaching demo for the Live Monitor.
//
// Two pretend bookings each take one pretend seat, then each wants the
// other's seat. Neither can move: that is a deadlock. The demo builds the
// wait-for graph, runs cycle detection on it, and recovers by letting one
// booking go first (aborting the younger one) so the other can finish.
//
// Pure in-memory logic — no DB writes, no real bookings, slots or
// allocations are ever touched. Stateless and repeatable: the same demo
// runs identically every time.
//
// UI text is plain language ("stuck in a circle", "let one go first").
// The real OS terms live in these comments only: wait-for graph, cycle
// detection, victim selection (abort the younger process), recovery.

const ACTORS = [
  { id: 'A', name: 'Demo booking A', startedAt: 1 },
  { id: 'B', name: 'Demo booking B', startedAt: 2 },
];
const SEATS = ['Demo seat 1', 'Demo seat 2'];

// --- tiny wait-for graph -------------------------------------------------
// holds: seat -> actor id. waits: actor id -> seat it is waiting for.
// An edge A -> B exists when A waits for a seat B holds. A cycle in that
// graph means deadlock: everyone in the cycle waits on someone in the cycle.
function buildWaitForGraph(holds, waits) {
  const graph = new Map(); // actor id -> Set(actor ids it waits on)
  for (const [actorId, seat] of Object.entries(waits)) {
    const holder = holds[seat];
    if (holder && holder !== actorId) {
      if (!graph.has(actorId)) graph.set(actorId, new Set());
      graph.get(actorId).add(holder);
    }
  }
  return graph;
}

// Depth-first cycle detection on the wait-for graph. Returns the cycle
// (list of actor ids) or null when nobody is stuck.
function findCycle(graph) {
  const state = new Map(); // 0 = unvisited, 1 = on the current path, 2 = done
  const path = [];
  function visit(node) {
    state.set(node, 1);
    path.push(node);
    for (const next of graph.get(node) || []) {
      if (state.get(next) === 1) return path.slice(path.indexOf(next));
      if (!state.get(next)) {
        const found = visit(next);
        if (found) return found;
      }
    }
    path.pop();
    state.set(node, 2);
    return null;
  }
  for (const node of graph.keys()) {
    if (!state.get(node)) {
      const found = visit(node);
      if (found) return found;
    }
  }
  return null;
}

function actorName(id) {
  return (ACTORS.find((a) => a.id === id) || {}).name || id;
}

function runDemo() {
  const steps = [];
  let no = 0;
  const add = (text, kind) => steps.push({ no: ++no, text, kind });

  // --- the scenario: each actor takes one seat, then wants the other ---
  const holds = {}; // seat -> actor id
  const waits = {}; // actor id -> seat

  holds[SEATS[0]] = 'A';
  add(`${ACTORS[0].name} takes ${SEATS[0]}.`, 'lock');
  holds[SEATS[1]] = 'B';
  add(`${ACTORS[1].name} takes ${SEATS[1]}.`, 'lock');

  waits.A = SEATS[1];
  add(
    `${ACTORS[0].name} now needs ${SEATS[1]} — but ${ACTORS[1].name} is holding it, so A waits.`,
    'wait'
  );
  waits.B = SEATS[0];
  add(
    `${ACTORS[1].name} now needs ${SEATS[0]} — but ${ACTORS[0].name} is holding it, so B waits.`,
    'wait'
  );

  // --- detection: build the wait-for graph and look for a cycle ---
  const graph = buildWaitForGraph(holds, waits);
  const cycle = findCycle(graph);
  if (!cycle) {
    // Cannot happen for this fixed scenario, but the demo must never lie.
    add('Nobody is stuck — both bookings can finish.', 'done');
    return { steps, summary: { victim: null, survivor: null, note: 'No circle was found.' } };
  }
  const cycleText = cycle
    .map((id, i) => `${actorName(id)} is waiting on ${actorName(cycle[(i + 1) % cycle.length])}`)
    .join(', ');
  add(
    `${cycleText}. They are stuck in a circle: nobody can move until somebody lets go.`,
    'detect'
  );

  // --- recovery: abort the younger actor (victim selection) ---
  // The younger booking started later, so it has done the least work and
  // is the cheapest to redo. Its locks are released; the survivor finishes.
  const victim = [...cycle]
    .map((id) => ACTORS.find((a) => a.id === id))
    .sort((a, b) => b.startedAt - a.startedAt)[0];
  const survivor = ACTORS.find((a) => a.id !== victim.id && cycle.includes(a.id));
  const released = [];
  for (const [seat, holder] of Object.entries(holds)) {
    if (holder === victim.id) {
      released.push(seat);
      delete holds[seat];
    }
  }
  delete waits[victim.id];
  add(
    `We let ${victim.name} go first: it gives up ${released.join(' and ')} so ${survivor.name} can finish. ` +
      `${victim.name} can try again afterwards — nothing is lost, it just waits its turn.`,
    'recover'
  );
  delete waits[survivor.id];
  add(
    `${survivor.name} finishes with both seats, then releases them. The circle is broken.`,
    'done'
  );

  return {
    steps,
    summary: {
      victim: victim.name,
      survivor: survivor.name,
      note: `${victim.name} started later, so it was the one asked to wait — it had the least to redo.`,
    },
  };
}

module.exports = { runDemo };
