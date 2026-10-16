// CPU scheduling simulator for the Scheduling Lab.
// simulate(algorithm, interviews, quantum) -> {order, gantt, avg_waiting_time, avg_turnaround_time}
//   algorithm: 'fcfs' | 'priority' (non-preemptive, lower number = higher priority) | 'rr'
//   interviews: [{id, label, burst, priority, arrival}]
//   Waiting = first start - arrival. Turnaround = finish - arrival. Averages rounded to 1 decimal.

function round1(n) {
  return Math.round(n * 10) / 10;
}

function cmpId(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function simulate(algorithm, interviews, quantum = 4) {
  const procs = (interviews || []).map((p) => ({
    id: p.id,
    label: p.label != null ? String(p.label) : String(p.id),
    burst: Number(p.burst),
    priority: p.priority != null ? Number(p.priority) : 99,
    arrival: p.arrival != null ? Number(p.arrival) : 0,
    remaining: Number(p.burst),
    firstStart: null,
    end: null,
  }));

  if (!procs.length) {
    return { order: [], gantt: [], avg_waiting_time: 0, avg_turnaround_time: 0 };
  }

  const gantt = [];
  const order = [];
  let time = 0;

  if (algorithm === 'fcfs') {
    // Run in arrival order (ties broken by id).
    const sorted = [...procs].sort((a, b) => a.arrival - b.arrival || cmpId(a.id, b.id));
    for (const p of sorted) {
      time = Math.max(time, p.arrival);
      p.firstStart = time;
      p.end = time + p.burst;
      gantt.push({ id: p.id, label: p.label, start: time, end: p.end });
      order.push(p.id);
      time = p.end;
    }
  } else if (algorithm === 'priority') {
    // Non-preemptive: whenever the CPU is free, pick the arrived process
    // with the lowest priority number (ties: earliest arrival, then id).
    const done = new Set();
    time = Math.min(...procs.map((p) => p.arrival));
    while (done.size < procs.length) {
      const candidates = procs
        .filter((p) => !done.has(p.id) && p.arrival <= time)
        .sort(
          (a, b) =>
            a.priority - b.priority || a.arrival - b.arrival || cmpId(a.id, b.id)
        );
      if (!candidates.length) {
        // CPU idles until the next arrival.
        time = Math.min(...procs.filter((p) => !done.has(p.id)).map((p) => p.arrival));
        continue;
      }
      const p = candidates[0];
      p.firstStart = time;
      p.end = time + p.burst;
      gantt.push({ id: p.id, label: p.label, start: time, end: p.end });
      order.push(p.id);
      done.add(p.id);
      time = p.end;
    }
  } else if (algorithm === 'rr') {
    // Round robin: each process runs for at most `quantum`, then goes to
    // the back of the ready queue. Arrival-aware: newcomers join the queue
    // as time passes.
    const q = Number(quantum) > 0 ? Number(quantum) : 4;
    const byArrival = [...procs].sort((a, b) => a.arrival - b.arrival || cmpId(a.id, b.id));
    const queue = [];
    const enqueued = new Set();
    time = byArrival[0].arrival;
    const admitArrived = () => {
      for (const p of byArrival) {
        if (!enqueued.has(p.id) && p.arrival <= time && p.remaining > 0) {
          enqueued.add(p.id);
          queue.push(p);
        }
      }
    };
    admitArrived();
    while (queue.length) {
      const p = queue.shift();
      if (p.firstStart === null) {
        p.firstStart = time;
        order.push(p.id);
      }
      const slice = Math.min(q, p.remaining);
      gantt.push({ id: p.id, label: p.label, start: time, end: time + slice });
      time += slice;
      p.remaining -= slice;
      admitArrived();
      if (p.remaining > 0) {
        queue.push(p);
      } else {
        p.end = time;
      }
    }
  } else {
    throw Object.assign(new Error(`Unknown algorithm "${algorithm}". Use fcfs, priority or rr.`), {
      status: 400,
    });
  }

  const n = procs.length;
  const avgWaiting = procs.reduce((s, p) => s + (p.firstStart - p.arrival), 0) / n;
  const avgTurnaround = procs.reduce((s, p) => s + (p.end - p.arrival), 0) / n;

  return {
    order,
    gantt,
    avg_waiting_time: round1(avgWaiting),
    avg_turnaround_time: round1(avgTurnaround),
  };
}

module.exports = { simulate };
