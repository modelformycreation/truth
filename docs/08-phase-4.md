# 08 · PHASE 4 — Wire-Level Networking & Parser Theory (LangSec)

> **Months 13–15 · Follow the bytes across the wire and learn why parsers are the heart of security.**
> **GATE: Manually parse raw network byte streams in C and handle TCP state connections — without relying on high-level libraries.**

---

## 🎯 What you'll be able to do by the end of this phase

- Explain the TCP/IP stack from the physical bits up to application data: Ethernet frame → IP packet → TCP segment → payload
- Capture real traffic in Wireshark and dissect every header field
- Read RFCs (especially RFC 9293 for TCP) as reference documents
- Write a **raw packet sniffer in C** (using `sys/socket.h` + raw sockets) that parses Ethernet/IP/TCP headers manually
- Write a **pure-C HTTP server** (no libraries beyond sockets) that parses HTTP requests byte-by-byte
- Think in **LangSec**: understand that every security bug is ultimately a parser bug — and learn to *spot* parser gaps on sight

---

## 📋 Prerequisites

- **PASSED the Phase 3 gate** (custom syscall in xv6 + page tables).
- Comfortable C. You'll be doing byte-level struct layout work.
- Knowledge of what syscalls are (you did Phase 3 — sockets are just syscalls: `socket()`, `bind()`, `listen()`, `accept()`, `recv()`, `send()`).

---

## ⏱️ Duration

- **~3 months** at 3.5h/day, 6 days/week.

---

## 👣 The Steps (do them in this exact order)

### Step 1 — The stack, visually (Month 13, weeks 1–2)
- Learn the **OSI-ish layering story** as it's really implemented on the wire:
  ```
  Application data (e.g. "GET / HTTP/1.1...")
        │
        ▼
  TCP segment (src/dst port, seq, ack, flags)   ← RFC 9293
        │
        ▼
  IP packet (src/dst IP, protocol=TCP, TTL)     ← RFC 791
        │
        ▼
  Ethernet frame (MAC addresses, type=0x0800)   ← IEEE 802.3
        │
        ▼
  Physical bits on the wire
  ```
- **Wireshark** ([wireshark.org](https://www.wireshark.org/)): capture your own traffic (open a website, `ping`, `ssh`) and click through every field. Do 5 captures minimum. Get bored of it — then you know it.
- Watch one LiveOverflow networking/parser video as the 10-minute primer (Learning Hack #2).

### Step 2 — Sockets in C (Month 13, weeks 3–4)
- Read **Beej's Guide to Network Programming** ([beej.us/guide/bgnet](https://beej.us/guide/bgnet/)) — the free classic. Do its examples.
- Understand: `socket()` → `bind()` → `listen()` → `accept()` for servers; `socket()` → `connect()` for clients; `send()`/`recv()` for data.
- **Mini-gate:** write a client that connects to `example.com:80` and sends a raw HTTP `GET` request (no `curl`, no libcurl — raw `send()`/`recv()`).

### Step 3 — TCP state machine (Month 14, week 1)
- Read the relevant sections of **RFC 9293** ([datatracker.ietf.org/doc/html/rfc9293](https://datatracker.ietf.org/doc/html/rfc9293)) — you do *not* read the whole RFC; read the state machine diagram and the sections on connection establishment/termination.
- Know the states: `LISTEN`, `SYN-SENT`, `SYN-RECEIVED`, `ESTABLISHED`, `FIN-WAIT-1/2`, `CLOSE-WAIT`, `LAST-ACK`, `TIME-WAIT`, `CLOSED`.
- Watch the transitions in Wireshark: capture a real connection with `Follow TCP Stream` off, watch the SYN→SYN-ACK→ACK handshake, then the FIN/ACK teardown.
- **Understand the classic abuse:** if a program keeps state on connections and mishandles a transition (e.g., ignores `RST`, or trusts the first `SYN`), that's an attack surface. State-machine flaws are real vulnerabilities.

### Step 4 — Raw packet sniffer in C (Month 14, weeks 2–3) — half the gate
- Write `sniffer.c` using a **raw socket**: `socket(AF_PACKET, SOCK_RAW, htons(ETH_P_ALL))` (Linux; run as root/with `sudo`).
- Parse, byte-by-byte, by hand:
  - Ethernet header (dst MAC 6B, src MAC 6B, ethertype 2B)
  - IPv4 header (version/IHL, total length, protocol, src/dst IP...)
  - TCP header (src/dst port, seq, ack, flags, window...)
- **Constraints (the point of the phase):** define the structs yourself with `#pragma pack`, or parse with raw offsets — no `libpcap`, no `netinet/tcp.h` convenience parsing beyond what you write.
- Test it: run your sniffer, open a website in a browser, and verify your parser prints sensible `src IP:port → dst IP:port [SYN,ACK]` lines.
- **Bonus:** a few lines of Wireshark's dissection of the same packet next to yours — they must agree.

### Step 5 — Pure-C HTTP server (Month 14, week 4 – Month 15, week 1) — the other half of the gate
- Write `httpserver.c`: `socket()` + `bind()` + `listen()` + `accept()`, then:
  - Read bytes until `\r\n\r\n` (end of headers)
  - Parse the request line: `METHOD SP PATH SP HTTP/1.1 CRLF`
  - Parse headers: `Name: Value` pairs, case-insensitive names
  - Serve a static file (read it, write `HTTP/1.1 200 OK\r\nContent-Length: N\r\n\r\n` + body)
  - Handle the TCP states properly: read until EOF, close cleanly on `Connection: close`, handle partial reads (a `recv()` can return *part* of a request — you must loop)
- Test with your browser, `curl`, and your own raw-socket client from Step 2.
- **This server is a parser.** As you write it, notice every place where malformed input could break your assumptions — you're building the exact mental model LangSec is about.

### Step 6 — Parser theory / LangSec (Month 15, weeks 2–3)
- Read the core idea at [langsec.org](https://langsec.org/) — the key papers/talks (start with the *"Parser Differentials"* and *"The Bugs We Have to Kill"* material).
- The core mental model, in one paragraph:
  > **Every security problem is a parsing problem.** Data crosses a trust boundary and gets interpreted. If the parser accepts more than the rest of the system assumes (instructions vs. data confusion), an attacker can smuggle meaning. Injection (SQL/command/LDAP), deserialization attacks, and protocol smuggling are all parser gaps.
- **Practice drill — the "parser gap" eye:** for each of these, state where the parser is and what it accepts beyond the assumption: a SQL query builder, a JSON deserializer, a URL parser, an email parser, an HTTP header parser, a DNS resolver.
- This phase's whole purpose: from now on, when you look at *any* system, your first question is **"where is the parser, and what does it accept?"**

---

## 🚪 THE GATE — Phase 4 Exit Test

> **You pass Phase 4 when all of these are true:**

- [ ] My raw sniffer parses Ethernet/IP/TCP headers **manually** (my own structs/offsets) and matches Wireshark's dissection of the same packets
- [ ] My pure-C HTTP server handles real browser requests: parses request line + headers, serves files, handles partial reads, closes per TCP state rules
- [ ] I can draw the TCP state machine from memory and explain the 3-way handshake and 4-way teardown
- [ ] I can explain LangSec: "every security bug is a parser bug" with 3 concrete examples of my own
- [ ] I can look at a captured packet in Wireshark and identify src/dst ports, sequence numbers, flags, and payload — without thinking

**Passed?** → [Phase 5](09-phase-5.md). **Not yet?** → The two programs are the gate: keep iterating until they're robust against malformed input.

---

## ⚠️ Common Mistakes (avoid these)

| Mistake | Why it's fatal | Fix |
|---|---|---|
| Using `recv()` once and assuming you got the whole message | TCP is a *stream*, not messages — this is THE classic networking bug | Always loop: `recv()` until you have the bytes you need |
| Copying a packet-parsing tutorial | The gate is *manual parsing* — you must own the byte layout | Write every offset yourself; use the RFC as reference, not code |
| Reading the whole RFC 9293 | You'll drown in detail and retain nothing | Read the state-machine + handshake/teardown sections |
| Skipping LangSec as "philosophy" | It's the single most transferable security insight in this framework | Do the practice drill in Step 6; it changes how you see everything |
| Not testing with malformed input | Robustness is the point | Feed your server garbage: partial lines, huge headers, no `\r\n`, binary bytes. Fix the crashes |
| Running sniffers only on localhost | No traffic variety | Sniff real traffic: browsing, streaming, whatever your machine does |

---

## 🆘 Stuck? Do this

1. **Raw socket permission denied?** `AF_PACKET` sockets need root: `sudo ./sniffer` (or add a `CAP_NET_RAW` capability). On WSL2, raw sockets work — if not, use a VirtualBox Ubuntu VM.
2. **Wrong bytes in my parser?** Print a hex dump of the packet (`xxd` or `hexdump`) and line up your struct offsets against it *byte by byte*. Off-by-8 errors are almost always endianness or a missed padding byte (`#pragma pack` or explicit offsets fix this).
3. **Server hangs waiting for requests?** Check your loop: `accept()` blocks; that's correct. If a *request* hangs, you're probably waiting for `\r\n\r\n` but the client sent nothing — test with `curl -v` and watch what bytes arrive (`tcpdump -A` or Wireshark).
4. **HTTP parsing edge cases exploding?** Good — that's the lesson. Isolate each case (no path, uppercase method, duplicate headers, chunked body) and handle it one at a time.
5. **LangSec not clicking?** Watch the 10-minute primers (LiveOverflow / langsec talks), then re-read the one-paragraph model above and *teach it to a rubber duck*.

---

## 🔗 Bridge to Phase 5

You can now read bytes on the wire and you see the world through parsers. **Phase 5 is where it all converges:** memory (Phase 1), machine code (Phase 2), the kernel (Phase 3), and protocol/parser thinking (Phase 4) become *exploits*. You'll take real binaries protected by real mitigations and break them.

→ **[09-phase-5.md](09-phase-5.md)**
