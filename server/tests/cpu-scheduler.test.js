// server/tests/cpu-scheduler.test.js
// Node.js built-in test runner (node --test) verifies the scheduling algorithms.

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { simulate } = require('../src/os/cpu-scheduler');

// Helper to compare floating numbers rounded to 1 decimal
function eq(a, b) { return Math.round(a * 10) / 10 === Math.round(b * 10) / 10; }

describe('CPU Scheduler simulations', () => {
  const processes = [
    { id: 1, arrival: 0, burst: 5, priority: 2 },
    { id: 2, arrival: 1, burst: 3, priority: 1 },
    { id: 3, arrival: 2, burst: 8, priority: 3 },
    { id: 4, arrival: 3, burst: 6, priority: 2 },
  ];

  test('FCFS produces textbook results', () => {
    const r = simulate('fcfs', processes);
    assert.deepStrictEqual(r.order, [1, 2, 3, 4]);
    // Waiting: 0, 4, 6, 13 => avg 5.75 -> 5.8. Turnaround: 5, 7, 14, 19 => 11.25 -> 11.3.
    assert.ok(eq(r.avg_waiting_time, 5.8));
    assert.ok(eq(r.avg_turnaround_time, 11.3));
  });

  test('SJF (non-preemptive) matches expected order', () => {
    const r = simulate('sjf', processes);
    // P1 runs first (only one arrived at t=0), then shortest among arrived: P2(3), P4(6), P3(8).
    assert.deepStrictEqual(r.order, [1, 2, 4, 3]);
  });

  test('SRTF (preemptive) matches known example', () => {
    const r = simulate('srtf', processes);
    // P1 runs 0-1, P2 preempts (3 remaining < 4) and runs 1-4, P1 resumes
    // 4-8, P4 runs 8-14, P3 runs 14-22. First start minus arrival:
    // P1 0, P2 0, P3 12, P4 5 => avg 4.25 -> 4.3.
    assert.deepStrictEqual(r.order, [2, 1, 4, 3]);
    assert.ok(eq(r.avg_waiting_time, 4.3));
  });

  test('Priority (non-preemptive) respects arrival first, then priority', () => {
    const r = simulate('priority', processes);
    // At t=0 only P1 has arrived, so it runs first despite P2's higher
    // priority; then P2 (priority 1), P4 (priority 2), P3 (priority 3).
    assert.deepStrictEqual(r.order, [1, 2, 4, 3]);
  });

  test('Unknown algorithm throws a 400 error', () => {
    assert.throws(() => simulate('rr', processes, 2), (e) => e.status === 400);
  });

  test('Empty input returns zeroed metrics', () => {
    const r = simulate('fcfs', []);
    assert.deepStrictEqual(r, {
      order: [], gantt: [], avg_waiting_time: 0, avg_turnaround_time: 0,
      avg_response_time: 0, cpu_utilization: 0, throughput: 0,
    });
  });
});
