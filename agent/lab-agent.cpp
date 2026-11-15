// lab-agent — CampusFlow lab-monitoring agent (Phase 2, M3).
//
// A tiny C++ program that runs ON a lab machine and reports that machine's
// own liveness to the CampusFlow server, so the test-session scheduler can
// prefer labs whose machines are actually up and free right now.
//
// Honest by design:
//   * It reports the machine it runs on. 'free' means this machine's 1-minute
//     load average is below 80% of its CPU count; 'busy' means above it.
//   * It never reports 'down'. A machine that stops reporting is marked down
//     by the SERVER, which infers it from silence (last_seen older than
//     5 minutes). A dead machine cannot report itself.
//   * No dependencies beyond the C++ standard library and POSIX sockets:
//     plain HTTP/1.1 POST with a hand-built JSON body. That is the whole
//     point — a lab machine only needs g++, no libcurl, no packages.
//
// Build:  g++ -std=c++17 -O2 -o lab-agent lab-agent.cpp
// Run:    ./lab-agent --server http://localhost:5000 --lab 1 --machines pc01,pc02,pc03 --key dev-agent-key
//         ./lab-agent --interval 30            (report every 30 seconds until stopped)

#include <arpa/inet.h>
#include <netdb.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <unistd.h>

#include <chrono>
#include <csignal>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

namespace {

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

std::string getenvOr(const char *name, const std::string &fallback) {
  const char *v = std::getenv(name);
  return (v && *v) ? std::string(v) : fallback;
}

std::vector<std::string> splitComma(const std::string &s) {
  std::vector<std::string> out;
  std::stringstream ss(s);
  std::string item;
  while (std::getline(ss, item, ',')) {
    // trim whitespace
    const size_t a = item.find_first_not_of(" \t\r\n");
    const size_t b = item.find_last_not_of(" \t\r\n");
    if (a != std::string::npos) out.push_back(item.substr(a, b - a + 1));
  }
  return out;
}

// Escape a string for inclusion in a JSON string literal.
std::string jsonEscape(const std::string &s) {
  std::string out;
  for (char c : s) {
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (static_cast<unsigned char>(c) < 0x20) {
          char buf[8];
          std::snprintf(buf, sizeof buf, "\\u%04x", c);
          out += buf;
        } else {
          out += c;
        }
    }
  }
  return out;
}

std::string localHostname() {
  char buf[256] = {0};
  if (::gethostname(buf, sizeof buf) == 0 && buf[0]) return std::string(buf);
  return "lab-machine";
}

// ---------------------------------------------------------------------------
// Load: 1-minute load average from /proc/loadavg, CPU count from the system.
// ---------------------------------------------------------------------------

double load1Min() {
  std::ifstream f("/proc/loadavg");
  double load = -1;
  if (f >> load) return load;
  return -1; // not a Linux host, or /proc unreadable
}

unsigned cpuCount() {
  unsigned n = std::thread::hardware_concurrency();
  if (n > 0) return n;
  // Fallback: count "processor" lines in /proc/cpuinfo.
  std::ifstream f("/proc/cpuinfo");
  std::string line;
  unsigned count = 0;
  while (std::getline(f, line)) {
    if (line.rfind("processor", 0) == 0) ++count;
  }
  return count > 0 ? count : 1;
}

// 'busy' when the 1-minute load average is above 80% of the CPU count,
// otherwise 'free'. A machine that can run this program is up by definition.
std::string machineStatus() {
  const double load = load1Min();
  if (load < 0) return "free"; // cannot measure load: report free, not down
  const double threshold = 0.8 * static_cast<double>(cpuCount());
  return load > threshold ? "busy" : "free";
}

// ---------------------------------------------------------------------------
// Minimal HTTP client: POST a JSON body, return the HTTP status code,
// or -1 when the server could not be reached at all.
// ---------------------------------------------------------------------------

struct ServerUrl {
  std::string host;
  std::string port = "80";
  std::string basePath; // e.g. "" or "/campusflow"
};

bool parseServerUrl(const std::string &url, ServerUrl &out, std::string &error) {
  std::string rest = url;
  if (rest.rfind("http://", 0) == 0) {
    rest = rest.substr(7);
  } else if (rest.rfind("https://", 0) == 0) {
    error = "https is not supported by this agent — use http:// for the lab server.";
    return false;
  }
  // Split off any path prefix: host[:port][/path...]
  const size_t slash = rest.find('/');
  std::string hostport = (slash == std::string::npos) ? rest : rest.substr(0, slash);
  out.basePath = (slash == std::string::npos) ? "" : rest.substr(slash);
  while (!out.basePath.empty() && out.basePath.back() == '/') out.basePath.pop_back();
  const size_t colon = hostport.rfind(':');
  if (colon != std::string::npos) {
    out.host = hostport.substr(0, colon);
    out.port = hostport.substr(colon + 1);
  } else {
    out.host = hostport;
  }
  if (out.host.empty()) {
    error = "No host in --server URL.";
    return false;
  }
  return true;
}

// Returns HTTP status code, or -1 with `error` set when nothing answered.
int httpPostJson(const ServerUrl &srv, const std::string &path, const std::string &key,
                 const std::string &body, std::string &error) {
  addrinfo hints{};
  hints.ai_family = AF_UNSPEC;
  hints.ai_socktype = SOCK_STREAM;
  addrinfo *addrs = nullptr;
  if (::getaddrinfo(srv.host.c_str(), srv.port.c_str(), &hints, &addrs) != 0 || !addrs) {
    error = "Could not resolve host '" + srv.host + "'.";
    return -1;
  }
  int sock = -1;
  for (addrinfo *ai = addrs; ai; ai = ai->ai_next) {
    sock = ::socket(ai->ai_family, ai->ai_socktype, ai->ai_protocol);
    if (sock < 0) continue;
    if (::connect(sock, ai->ai_addr, ai->ai_addrlen) == 0) break;
    ::close(sock);
    sock = -1;
  }
  ::freeaddrinfo(addrs);
  if (sock < 0) {
    error = std::string("Could not connect to ") + srv.host + ":" + srv.port + " (" +
            std::strerror(errno) + ").";
    return -1;
  }

  std::ostringstream req;
  req << "POST " << path << " HTTP/1.1\r\n"
      << "Host: " << srv.host << ":" << srv.port << "\r\n"
      << "Content-Type: application/json\r\n"
      << "X-Agent-Key: " << key << "\r\n"
      << "Content-Length: " << body.size() << "\r\n"
      << "Connection: close\r\n\r\n"
      << body;
  const std::string request = req.str();
  size_t sent = 0;
  while (sent < request.size()) {
    const ssize_t n = ::send(sock, request.data() + sent, request.size() - sent, 0);
    if (n <= 0) {
      error = "Connection broke while sending the report.";
      ::close(sock);
      return -1;
    }
    sent += static_cast<size_t>(n);
  }

  std::string response;
  char buf[4096];
  ssize_t n;
  while ((n = ::recv(sock, buf, sizeof buf, 0)) > 0) response.append(buf, static_cast<size_t>(n));
  ::close(sock);

  // First line: "HTTP/1.1 200 OK"
  std::istringstream first(response);
  std::string httpVersion;
  int status = 0;
  if (!(first >> httpVersion >> status) || status == 0) {
    error = "The server answered, but not with HTTP — is that address the CampusFlow API?";
    return -1;
  }
  if (status == 401) error = "The server rejected the agent key (401). Check LAB_AGENT_KEY.";
  return status;
}

// ---------------------------------------------------------------------------
// One report: measure this machine, build the JSON, POST it, print one line.
// Returns 0 on success, 1 on failure (never throws out of main).
// ---------------------------------------------------------------------------

int reportOnce(const ServerUrl &srv, const std::string &serverLabel, long labId,
               const std::vector<std::string> &machines, const std::string &key) {
  const std::string status = machineStatus();
  int freeCount = 0, busyCount = 0;
  std::ostringstream body;
  body << "{\"lab_resource_id\":" << labId << ",\"machines\":[";
  for (size_t i = 0; i < machines.size(); ++i) {
    if (i) body << ",";
    body << "{\"name\":\"" << jsonEscape(machines[i]) << "\",\"status\":\"" << status << "\"}";
  }
  body << "],\"reported_by\":\"lab-agent\"}";
  if (status == "free") freeCount = static_cast<int>(machines.size());
  else busyCount = static_cast<int>(machines.size());

  std::string error;
  const int httpStatus =
      httpPostJson(srv, srv.basePath + "/api/lab-agent/report", key, body.str(), error);
  if (httpStatus < 0) {
    std::cerr << "Could not reach the server at " << serverLabel << " — " << error << std::endl;
    return 1;
  }
  if (httpStatus < 200 || httpStatus >= 300) {
    std::cerr << "The server at " << serverLabel << " refused the report (HTTP " << httpStatus << ")."
              << (error.empty() ? "" : " " + error) << std::endl;
    return 1;
  }
  std::cout << "Reported " << machines.size() << " machine" << (machines.size() == 1 ? "" : "s")
            << " to " << serverLabel << " — " << freeCount << " free, " << busyCount << " busy."
            << std::endl;
  return 0;
}

volatile std::sig_atomic_t stopRequested = 0;
void onSignal(int) { stopRequested = 1; }

void printUsage(const char *prog) {
  std::cerr << "Usage: " << prog << " [options]\n"
            << "  --server URL        CampusFlow server, e.g. http://localhost:5000 (env LAB_SERVER)\n"
            << "  --lab ID            Lab resource id to report for (env LAB_ID)\n"
            << "  --machines a,b,c    Machine names to report, comma-separated (env LAB_MACHINES;\n"
            << "                      default: this machine's hostname)\n"
            << "  --key SECRET        Shared agent key (env LAB_AGENT_KEY)\n"
            << "  --interval SECONDS  Report every N seconds; 0 (default) reports once and exits\n";
}

} // namespace

int main(int argc, char **argv) {
  std::string server = getenvOr("LAB_SERVER", "http://localhost:5000");
  std::string labStr = getenvOr("LAB_ID", "");
  std::string machinesStr = getenvOr("LAB_MACHINES", "");
  std::string key = getenvOr("LAB_AGENT_KEY", "dev-agent-key");
  long intervalSec = 0;

  for (int i = 1; i < argc; ++i) {
    std::string arg = argv[i];
    auto needValue = [&](const char *flag) -> std::string {
      if (i + 1 >= argc) {
        std::cerr << "Missing value after " << flag << "." << std::endl;
        printUsage(argv[0]);
        std::exit(2);
      }
      return argv[++i];
    };
    if (arg == "--server") server = needValue("--server");
    else if (arg == "--lab") labStr = needValue("--lab");
    else if (arg == "--machines") machinesStr = needValue("--machines");
    else if (arg == "--key") key = needValue("--key");
    else if (arg == "--interval") {
      const std::string v = needValue("--interval");
      try {
        intervalSec = std::stol(v);
      } catch (...) {
        std::cerr << "--interval needs a whole number of seconds." << std::endl;
        return 2;
      }
      if (intervalSec < 0) {
        std::cerr << "--interval cannot be negative." << std::endl;
        return 2;
      }
    } else if (arg == "--help" || arg == "-h") {
      printUsage(argv[0]);
      return 0;
    } else {
      std::cerr << "Unknown option: " << arg << std::endl;
      printUsage(argv[0]);
      return 2;
    }
  }

  if (labStr.empty()) {
    std::cerr << "No lab given. Pass --lab <resource id> (the lab's id in CampusFlow Resources)."
              << std::endl;
    printUsage(argv[0]);
    return 2;
  }
  long labId = 0;
  try {
    size_t used = 0;
    labId = std::stol(labStr, &used);
    if (used != labStr.size() || labId <= 0) throw std::invalid_argument("bad lab id");
  } catch (...) {
    std::cerr << "--lab needs the lab's numeric id from CampusFlow Resources, not '" << labStr
              << "'." << std::endl;
    return 2;
  }

  std::vector<std::string> machines =
      machinesStr.empty() ? std::vector<std::string>{localHostname()} : splitComma(machinesStr);
  if (machines.empty()) {
    std::cerr << "No machine names given. Pass --machines pc01,pc02,pc03." << std::endl;
    return 2;
  }

  ServerUrl srv;
  std::string urlError;
  if (!parseServerUrl(server, srv, urlError)) {
    std::cerr << urlError << std::endl;
    return 2;
  }
  // Display label without any path prefix confusion: host as the user typed it.
  std::string serverLabel = server;
  while (!serverLabel.empty() && serverLabel.back() == '/') serverLabel.pop_back();

  std::signal(SIGINT, onSignal);
  std::signal(SIGTERM, onSignal);

  int rc = 0;
  do {
    rc = reportOnce(srv, serverLabel, labId, machines, key);
    if (intervalSec <= 0 || stopRequested) break;
    for (long waited = 0; waited < intervalSec && !stopRequested; ++waited) {
      std::this_thread::sleep_for(std::chrono::seconds(1));
    }
  } while (!stopRequested);
  return rc;
}
