# CampusFlow Windows Monitoring Agent API Specification

Version: 1.0.0  
Protocol: HTTP / JSON REST + Socket.IO Telemetry Broadcast  
Base Path: `/api/agent`  
Authentication: HTTP Bearer Token (`Authorization: Bearer <agent_token>`)

---

## 1. Overview & Privacy Principles

The CampusFlow Windows Agent runs as a background service on dedicated physical lab PCs during proctored examinations.

### Strict Privacy Guarantee
To protect student privacy and adhere to data protection regulations, the agent and server adhere to the following guarantees:
- **No Keystroke Logging**: The agent does not intercept, capture, or log keystrokes.
- **No Screenshots**: No screen captures or video frames are taken or transmitted.
- **No Clipboard Capture**: Contents of the Windows clipboard are never accessed or read.
- **Telemetry Limit**: The agent collects **only** the active foreground window title and the executing process name (e.g. `discord.exe`, `CampusFlow Exam Browser`).

---

## 2. Authentication Model

1. **One-Time Enrollment**: Each physical computer in a lab is provisioned with a unique, cryptographically random `enrollment_code` (e.g. `ENROLL-LAB-A-4A7B9C12`).
2. **Bearer Token Issuance**: When the agent boots for the first time, it calls `POST /api/agent/register` with this enrollment code.
3. **SHA-256 Storage**: The server generates a 32-byte cryptographic random token and returns it **once** to the agent. The server stores only the SHA-256 hash in `agent_devices.token_hash`. Plaintext tokens are never stored in the database.
4. **Subsequent Calls**: All subsequent calls (`/heartbeat`, `/events`) must include `Authorization: Bearer <agent_token>`. Standard user JWTs are rejected.

---

## 3. API Endpoints

### 3.1 Device Registration
Enroll a new Windows machine and receive a dedicated agent authentication token.

- **URL**: `POST /api/agent/register`
- **Auth**: None (Rate-limited by client IP)
- **Content-Type**: `application/json`

#### Request Payload
```json
{
  "enrollment_code": "ENROLL-LAB-A-A91F03BC",
  "hostname": "LAB-A-PC01-WIN11",
  "agent_version": "1.0.0"
}
```

#### Response: `200 OK`
```json
{
  "agent_token": "4f9b8c2d1e0a3f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a",
  "computer": {
    "id": 1,
    "pc_code": "LAB-A-PC01"
  }
}
```

#### Error Responses
- `400 Bad Request`: Missing enrollment code.
- `404 Not Found`: Invalid or non-existent enrollment code.
- `429 Too Many Requests`: Rate limit exceeded.

---

### 3.2 Heartbeat & Session Sync
Sent every 5 seconds by the Windows agent. The server is the authoritative source for session state and blacklisted processes.

- **URL**: `POST /api/agent/heartbeat`
- **Auth**: `Authorization: Bearer <agent_token>`
- **Content-Type**: `application/json`

#### Request Payload
```json
{
  "foreground_title": "CampusFlow Exam Browser - Question 4",
  "foreground_process": "campusflow.exe"
}
```
*(Both fields optional; truncated by server to 255 characters).*

#### Response: `200 OK` (Active Session)
```json
{
  "server_time": "2026-11-14T14:10:00.000Z",
  "session": {
    "session_id": 12,
    "student_name": "Aarav Sharma",
    "exam_window_keyword": "CampusFlow",
    "ends_at": "2026-11-14T15:30:00.000Z"
  },
  "prohibited_processes": [
    "anydesk.exe",
    "chatgpt.exe",
    "discord.exe",
    "slack.exe",
    "teamviewer.exe",
    "telegram.exe",
    "whatsapp.exe",
    "zoom.exe"
  ]
}
```

#### Response: `200 OK` (No Active Session)
```json
{
  "server_time": "2026-11-14T14:10:00.000Z",
  "session": null,
  "prohibited_processes": [
    "anydesk.exe",
    "chatgpt.exe",
    "discord.exe",
    "slack.exe",
    "teamviewer.exe",
    "telegram.exe",
    "whatsapp.exe",
    "zoom.exe"
  ]
}
```

---

### 3.3 Event Telemetry Batch
Report anomalous events (e.g. process focus loss, prohibited apps detected).
Events are accepted **only** while the computer has an `active` exam session.

- **URL**: `POST /api/agent/events`
- **Auth**: `Authorization: Bearer <agent_token>`
- **Content-Type**: `application/json`

#### Allowed Event Types
| Event Type | Description |
| :--- | :--- |
| `FOCUS_LOST` | Foreground window switched away from exam browser |
| `WINDOW_SWITCH` | Active window changed to another desktop application |
| `WINDOW_MINIMIZED` | Exam browser window was minimized |
| `WINDOW_CLOSED` | Exam browser window was closed before completion |
| `PROHIBITED_PROCESS` | Blacklisted process (e.g. discord.exe) detected |

*(Note: `AGENT_DISCONNECTED` and `AGENT_RECONNECTED` are generated exclusively by the server sweeper).*

#### Request Payload (Max 50 events per batch)
```json
{
  "events": [
    {
      "event_type": "FOCUS_LOST",
      "window_title": "Discord - #general",
      "process_name": "discord.exe",
      "occurred_at": "2026-11-14T14:12:05.123Z"
    },
    {
      "event_type": "PROHIBITED_PROCESS",
      "window_title": "Discord",
      "process_name": "discord.exe",
      "occurred_at": "2026-11-14T14:12:05.125Z"
    }
  ]
}
```

#### Response: `200 OK`
```json
{
  "accepted": 2
}
```

#### Error Responses
- `400 Bad Request`: If no active session exists on the computer, or if events exceed 50, or if unauthorized event types are passed.
- `401 Unauthorized`: Invalid or revoked agent token.

---

## 4. Server Sweeper & Heartbeat Timeouts

The backend runs an internal periodic sweeper every 5 seconds:
- If `last_heartbeat_at` is older than **15 seconds**, the agent status transitions to `offline`.
- If the computer has an `active` exam session when it goes offline, the sweeper automatically inserts an `AGENT_DISCONNECTED` event.
- When an offline agent resumes heartbeats during an active session, an `AGENT_RECONNECTED` event is automatically generated.

