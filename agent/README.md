# Lab agent — the C++ program that watches a lab machine

A tiny C++ program that runs **on a lab machine** and tells the CampusFlow
server whether that machine is up and free right now, so test sessions get
scheduled into labs whose machines are actually working — not just labs with
the biggest capacity on paper.

## What it reports

Every run, the agent measures the machine it runs on and POSTs one report to
`POST /api/lab-agent/report`:

```json
{ "lab_resource_id": 1,
  "machines": [ { "name": "pc01", "status": "free" } ],
  "reported_by": "lab-agent" }
```

- **`free`** — the 1-minute load average (from `/proc/loadavg`) is below 80%
  of the machine's CPU count. The machine is idle enough to take a test batch.
- **`busy`** — load is above that line. The machine is working hard right now.
- It never reports **`down`**. A machine that has gone quiet cannot report
  itself — the server marks a machine down in the status list when it has not
  heard from it for over 5 minutes (`last_seen` older than 5 minutes).

## Build

```bash
g++ -std=c++17 -O2 -o lab-agent lab-agent.cpp
```

No extra libraries, no libcurl, no packages to install — the agent speaks
plain HTTP/1.1 over POSIX sockets and builds its JSON by hand. That is
deliberate: a lab machine only needs `g++` to run it. (It also means the
agent only speaks plain `http://`, not `https://`.)

## Run

```bash
# One report, then exit:
./lab-agent --server http://localhost:5000 --lab 1 --machines pc01,pc02,pc03 --key dev-agent-key

# Report every 30 seconds until stopped (Ctrl+C):
./lab-agent --server http://localhost:5000 --lab 1 --machines pc01,pc02,pc03 --interval 30

# With environment variables instead of flags:
LAB_SERVER=http://localhost:5000 LAB_ID=1 LAB_MACHINES=pc01,pc02,pc03 LAB_AGENT_KEY=dev-agent-key ./lab-agent
```

`--lab` is the lab's numeric id in CampusFlow (Admin → Resources). If
`--machines` is left out, the agent reports just this machine under its own
hostname. A successful run prints one line, e.g.:

```
Reported 3 machines to http://localhost:5000 — 2 free, 1 busy
```

If the server cannot be reached, it prints a plain error line (e.g.
`Could not reach the server at http://localhost:5000 — Could not connect to
localhost:5000 (Connection refused).`) and exits with a non-zero code —
never a crash, never a stack trace.

## The agent key

The agent has no login, so it authenticates with a shared key in the
`X-Agent-Key` header. The server checks it against `LAB_AGENT_KEY`
(`server/.env.example`). The default `dev-agent-key` is for local
development only — **a real deployment must set a long random
`LAB_AGENT_KEY`** on the server and pass the same value to the agent.
A wrong or missing key gets a 401 and the report is refused.

## How the scheduler uses its data

`server/src/os/lab-status.js` counts recently-reported free machines per lab
(`freeMachineCounts`). When the test-session scheduler
(`server/src/os/pipeline.js`, `scheduleTestSessions`) picks labs, it prefers
labs with more free machines — capacity stays the tiebreak. If the agent has
never run, scheduling behaves exactly as before (capacity only). The
Resources page (Admin → Resources → "Lab machines") shows the live list:
machine, lab, status, and how long ago it last reported.

## Honest limitations

- The agent reports the machine it runs on. To cover a whole lab, run one
  copy per machine (each with its own `--machines` name), or one copy on a
  machine that can see the lab's machines — the agent itself only measures
  local load.
- Load average is a Linux measurement (`/proc/loadavg`). On a machine without
  `/proc`, the agent reports `free` rather than guessing.
- `down` is inferred from silence, so a machine is only noticed as down up
  to 5 minutes after it stops reporting.
