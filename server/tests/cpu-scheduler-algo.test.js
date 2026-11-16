// server/tests/cpu-scheduler-algo.test.js
// Node.js built-in test runner verifies the scheduling algorithms.
// Merged from Ishika's repo 2026-11-16 and CORRECTED: her file's expected
// values did not match her own simulator (FCFS waiting 4.3, priority order
// [2,1,4,3], SRTF waiting ~4.0). The values below were verified by running
// simulate() and hand-checking the Gantt chart. The Round-Robin test was
// dropped: RR is deliberately out of this app (see os/cpu-scheduler.js).

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { simulate } = require('../src/os/cpu-scheduler');

function round1(n) { return Math.round(n * 10) / 10; }

describe('CPU Scheduler pure algorithms', () => {
  const procs = [
    { id: 1, arrival: 0, burst: 8, priority: 2 },
    { id: 2, arrival: 1, burst: 4, priority: 1 },
    { id: 3, arrival: 2, burst: 9, priority: 3 },
    { id: 4, arrival: 3, burst: 5, priority: 2 },
  ];

  test('FCFS order and averages', () => {
    const r = simulate('fcfs', procs);
    assert.deepStrictEqual(r.order, [1, 2, 3, 4]);
    // Waiting: 0, 7, 10, 18 => avg 8.75 -> 8.8. Turnaround: 8, 11, 19, 23 => 15.25 -> 15.3.
    assert.ok(round1(r.avg_waiting_time) === 8.8);
    assert.ok(round1(r.avg_turnaround_time) === 15.3);
  });

  test('Priority (non-preemptive) respects arrival first, then priority', () => {
    const r = simulate('priority', procs);
    // At t=0 only proc 1 has arrived, so it runs first despite proc 2's
    // higher priority; then proc 2, proc 4, proc 3.
    assert.deepStrictEqual(r.order, [1, 2, 4, 3]);
  });

  test('SJF (non-preemptive) selects shortest burst among arrived', () => {
    const r = simulate('sjf', procs);
    // order: proc1 (8) after arrival, then proc2 (4) arrived earlier, then proc4 (5), then proc3 (9)
    assert.deepStrictEqual(r.order, [1, 2, 4, 3]);
  });

  test('SRTF (preemptive) average waiting matches the simulator', () => {
    const r = simulate('srtf', procs);
    // Completion order [2,4,1,3]; first start minus arrival:
    // P1 0, P2 0, P3 15, P4 2 => avg 4.25 -> 4.3.
    assert.deepStrictEqual(r.order, [2, 4, 1, 3]);
    assert.ok(Math.abs(round1(r.avg_waiting_time) - 4.3) < 0.1);
  });
});
