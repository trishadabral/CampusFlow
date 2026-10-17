// CPU scheduling simulator.
// simulate(algorithm, interviews) -> {order, gantt, avg_waiting_time, avg_turnaround_time}
//   algorithm: 'fcfs' | 'priority' (non-preemptive, lower number = higher priority)
//   interviews: [{id, label, burst, priority, arrival}]
//   Waiting = first start - arrival. Turnaround = finish - arrival. Averages rounded to 1 decimal.
// Round-robin was deliberately removed: preemptive time-slicing makes no sense
// for interviews (you can't pause a candidate mid-interview and resume later).

function round1(n) {
  return Math.round(n * 10) / 10;
}

function cmpId(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function simulate(algorithm, interviews) {
  const procs = (interviews || []).map((p) => ({
    id: p.id,
    label: p.label != null ? String(p.label) : String(p.id),
    burst: Number(p.burst),
    priority: p.priority != null ? Number(p.priority) : 99,
    arrival: p.arrival != null ? Number(p.arrival) : 0,
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
  } else {
    throw Object.assign(new Error(`Unknown algorithm "${algorithm}". Use fcfs or priority.`), {
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
