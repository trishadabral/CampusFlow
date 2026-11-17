// CPU scheduling simulator.
// simulate(algorithm, interviews, quantum?) -> {order, gantt, avg_waiting_time, avg_turnaround_time, avg_response_time, cpu_utilization, throughput}
//   algorithm: 'fcfs' | 'priority' | 'sjf' | 'srtf' (non-preemptive, lower number = higher priority)
//   interviews: [{id, label, burst, priority, arrival}]
//   Waiting = first start - arrival. Turnaround = finish - arrival. Response = first start - arrival.
//   Averages rounded to 1 decimal.
// Round-robin was deliberately removed: preemptive time-slicing makes no sense
// for interviews (you can't pause a candidate mid-interview and resume later).

function round1(n) {
  return Math.round(n * 10) / 10;
}

function cmpId(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function simulate(algorithm, interviews, quantum) {
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
    return { order: [], gantt: [], avg_waiting_time: 0, avg_turnaround_time: 0, avg_response_time: 0, cpu_utilization: 0, throughput: 0 };
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
  } else if (algorithm === 'sjf') {
    // Non-preemptive shortest job first: whenever the CPU is free, pick the
    // arrived process with the shortest burst (ties: earliest arrival, then id).
    const done = new Set();
    time = Math.min(...procs.map((p) => p.arrival));
    while (done.size < procs.length) {
      const candidates = procs
        .filter((p) => !done.has(p.id) && p.arrival <= time)
        .sort((a, b) => a.burst - b.burst || a.arrival - b.arrival || cmpId(a.id, b.id));
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
  } else if (algorithm === 'srtf') {
    // Preemptive shortest remaining time first: run one time unit at a
    // time, always picking the arrived process with the least work left
    // (ties: earliest arrival, then id). A later arrival with a shorter
    // remaining time preempts the running process.
    const arrived = [];
    const total = procs.length;
    let completed = 0;
    while (completed < total) {
      // Bring newly arrived processes into the ready set.
      for (const p of procs) {
        if (p.arrival <= time && !arrived.includes(p) && p.remaining > 0) arrived.push(p);
      }
      const candidates = arrived
        .filter((p) => p.remaining > 0)
        .sort((a, b) => a.remaining - b.remaining || a.arrival - b.arrival || cmpId(a.id, b.id));
      if (!candidates.length) {
        // CPU idles until the next arrival.
        time = Math.min(...procs.filter((p) => p.remaining > 0).map((p) => p.arrival));
        continue;
      }
      const p = candidates[0];
      if (p.firstStart === null) p.firstStart = time;
      // Run for 1 time unit (granularity).
      const start = time;
      time += 1;
      p.remaining -= 1;
      gantt.push({ id: p.id, label: p.label, start, end: time });
      if (p.remaining === 0) {
        p.end = time;
        order.push(p.id);
        completed++;
      }
    }
  } else {
    throw Object.assign(new Error(`Unknown algorithm "${algorithm}". Use fcfs, priority, sjf or srtf.`), {
      status: 400,
    });
  }

  const n = procs.length;
  const avgWaiting = procs.reduce((s, p) => s + (p.firstStart - p.arrival), 0) / n;
  const avgTurnaround = procs.reduce((s, p) => s + (p.end - p.arrival), 0) / n;
  // Response time is first start minus arrival; for the non-preemptive
  // algorithms it equals waiting time, for SRTF it can be shorter.
  const avgResponse = procs.reduce((s, p) => s + (p.firstStart - p.arrival), 0) / n;
  const makespan = Math.max(...procs.map((p) => p.end));
  const cpuUtil = makespan ? (gantt.reduce((s, g) => s + (g.end - g.start), 0) / makespan) * 100 : 0;
  const throughput = n / (makespan || 1);

  return {
    order,
    gantt,
    avg_waiting_time: round1(avgWaiting),
    avg_turnaround_time: round1(avgTurnaround),
    avg_response_time: round1(avgResponse),
    cpu_utilization: round1(cpuUtil),
    throughput: round1(throughput),
  };
}

module.exports = { simulate };
