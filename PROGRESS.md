# ✅ PROGRESS — Your Personal Tracker

> **This file is your GPS.** Every step of every phase has a checkbox here. When you're lost or unmotivated, open this file — the next unchecked box is literally your next task.
>
> **How to use:** tick boxes as you complete them. Update the "Current status" section at the start of each week. If a gate is unchecked, you are still in that phase — that's by design.

---

## 📍 Current Status (update weekly)

- **Start date:** ____________
- **Today's date:** ____________
- **Current phase:** 1 · 2 · 3 · 4 · 5 · Consolidation · Post-24 (circle one)
- **Phase gates passed:** 0 / 5
- **Hours logged this week:** ____ / 21 (3.5h × 6 days)
- **This week's one goal:** ____________________________________

---

## 🗓️ Daily Habits (tick every day you do them — this is the engine)

| Day | 60 min theory | 90 min coding | 60 min labs | Godbolt 10-min | Rest day respected |
|---|---|---|---|---|---|
| Mon | ☐ | ☐ | ☐ | ☐ | — |
| Tue | ☐ | ☐ | ☐ | ☐ | — |
| Wed | ☐ | ☐ | ☐ | ☐ | — |
| Thu | ☐ | ☐ | ☐ | ☐ | — |
| Fri | ☐ | ☐ | ☐ | ☐ | — |
| Sat | ☐ | ☐ | ☐ | ☐ | — |
| Sun | — | — | — | — | ☐ |

---

## 🏗️ PHASE 1 — Computer Architecture & Low-Level C (Months 1–4)

**Goal:** Understand memory + machine code. **Gate:** own `malloc()`/`free()` that works.

### Steps
- [ ] Step 1: Linux environment set up (WSL2 / VM / pwn.college terminal), toolchain installed, hello world compiles
- [ ] Step 2: Godbolt daily habit started (10 min/day)
- [ ] Step 3: C fundamentals — variables, types, functions
- [ ] Step 3: Pointers — `&`, `*`, pointer arithmetic
- [ ] Step 3: Stack vs heap — can explain where any variable lives
- [ ] Step 3: Structs, arrays, strings (`char*` + `\0`)
- [ ] Step 3: `malloc`/`free` + ownership discipline
- [ ] Step 4: CS:APP **Data Lab** — all puzzles pass
- [ ] Step 5: Nand2Tetris projects 1–6 (gates → assembler) *(recommended)*
- [ ] Step 6: CS:APP **Malloc Lab** — implicit/explicit free list, `mdriver` passes
- [ ] Step 7: Fresh `malloc()`/`free()` written from scratch + own test suite
- [ ] Step 7: Runs clean under AddressSanitizer (`-fsanitize=address`)

### 🚪 GATE 1 — check all
- [ ] My own `malloc()`/`free()` works without crashing (many sizes, any free order)
- [ ] I can explain where locals, heap blocks, and return addresses live
- [ ] I can identify prologue/body/epilogue of a C function in Godbolt assembly
- [ ] `PROGRESS.md` Phase 1 entry complete

**→ Gate 1 passed on: ____________**

---

## 🧩 PHASE 2 — Assembly & Reverse Engineering (Months 5–8)

**Goal:** Read machine code like a language. **Gate:** crack a mystery binary, extract hidden key, no source.

### Steps
- [ ] Step 1: RE4B early chapters (x86_64) read + Godbolt experiments done
- [ ] Step 1: Calling convention internalized (RDI/RSI/RDX/RCX/R8/R9, RAX return)
- [ ] Step 2: GDB basics — breakpoints, `stepi`, `info registers`, `x/` memory examination
- [ ] Step 2: pwndbg or GDB-peda installed
- [ ] Step 3: Bomb Lab — phase 1
- [ ] Step 3: Bomb Lab — phase 2
- [ ] Step 3: Bomb Lab — phase 3
- [ ] Step 3: Bomb Lab — phase 4
- [ ] Step 3: Bomb Lab — phase 5
- [ ] Step 3: Bomb Lab — phase 6 *(all 6 done)*
- [ ] Step 4: Microcorruption levels 1–4
- [ ] Step 4: Microcorruption levels 5–10
- [ ] Step 5: Ghidra installed; 10 of my own binaries reversed (O0/O2/stripped)
- [ ] Step 6: Crackme #1 (difficulty 1.x)
- [ ] Step 6: Crackme #2 (difficulty 1.x–2.x)
- [ ] Step 6: Crackme #3 (difficulty 2.x)
- [ ] Step 6: Crackme #4 (difficulty 2.x–3.x)
- [ ] Step 7: Azeria Labs ARM — Writing ARM Assembly series started

### 🚪 GATE 2 — check all
- [ ] A NEW medium crackme (never seen) cracked; key extracted with no source read
- [ ] I can explain the binary's check logic out loud
- [ ] Microcorruption 1–10 OR 6+ crackmes complete
- [ ] I can read a 30-line x86_64 function and summarize it

**→ Gate 2 passed on: ____________**

---

## 🐧 PHASE 3 — OS Internals & Kernel Boundaries (Months 9–12)

**Goal:** Understand the kernel boundary; modify a real kernel. **Gate:** custom syscall + page tables in xv6.

### Steps
- [ ] Step 1: Linux syscall table studied; syscall mechanics (RAX=number, args in RDI/RSI/...)
- [ ] Step 1: Direct `syscall(SYS_write, ...)` program written (no libc wrapper)
- [ ] Step 1: `strace` used to observe real programs
- [ ] Step 2: xv6 book — Operating System Interfaces chapter
- [ ] Step 2: xv6 book — Page Tables chapter
- [ ] Step 2: Can explain Ring 0 vs Ring 3, process isolation, UIDs/SIDs
- [ ] Step 3: xv6 builds and boots under QEMU (`make qemu` → shell)
- [ ] Step 4: Lab **util** — sleep, pingpong, primes
- [ ] Step 4: Lab **syscall** — trace + sysinfo added to kernel
- [ ] Step 4: Lab **pgtbl** — vmprint + user mapping
- [ ] Step 4: Lab **traps** — backtrace + alarm
- [ ] Step 4: Lab **cow** — copy-on-write fork *(recommended)*
- [ ] Step 4: Stretch labs (net / lock / fs / mmap) — as many as possible
- [ ] Step 5: MY OWN custom syscall designed and implemented end-to-end
- [ ] Step 5: User program successfully calls my new syscall

### 🚪 GATE 3 — check all
- [ ] Custom syscall added (number + handler + table + user function) and works
- [ ] Page-table lab requirements pass the official tests
- [ ] I can explain syscall path end-to-end (user code → kernel → return)
- [ ] I can explain what a corrupted page table would do

**→ Gate 3 passed on: ____________**

---

## 🌐 PHASE 4 — Wire-Level Networking & Parser Theory (Months 13–15)

**Goal:** Read the wire; see the world through parsers. **Gate:** raw parsing + TCP states in pure C.

### Steps
- [ ] Step 1: TCP/IP layering story drawn and explained
- [ ] Step 1: Wireshark — 5+ real captures dissected field by field
- [ ] Step 2: Beej's Guide — sockets client/server examples done
- [ ] Step 2: Raw HTTP GET client written (no libcurl)
- [ ] Step 3: RFC 9293 — state machine + handshake/teardown sections read
- [ ] Step 3: TCP handshake + teardown observed live in Wireshark
- [ ] Step 4: `sniffer.c` — raw socket, Ethernet+IPv4+TCP parsed manually
- [ ] Step 4: Sniffer output matches Wireshark on the same traffic
- [ ] Step 5: `httpserver.c` — parses request line + headers byte-by-byte
- [ ] Step 5: Serves static files with correct `Content-Length`
- [ ] Step 5: Handles partial reads, malformed input, clean closes
- [ ] Step 6: LangSec core materials read (langsec.org)
- [ ] Step 6: Parser-gap drill done (SQL, JSON, URL, email, HTTP, DNS)

### 🚪 GATE 4 — check all
- [ ] Raw sniffer parses Ethernet/IP/TCP with my own structs/offsets — matches Wireshark
- [ ] Pure-C HTTP server handles real browser requests robustly
- [ ] I can draw the TCP state machine from memory
- [ ] I can explain "every security bug is a parser bug" with 3 of my own examples

**→ Gate 4 passed on: ____________**

---

## 💥 PHASE 5 — Vulnerability Research & Binary Exploitation (Months 16–20)

**Goal:** Break real binaries with modern protections. **Gate:** ASLR+NX+canary binary → ROP chain → `/bin/sh`.

### Steps
- [ ] Step 1: pwn.college — Program Interaction module
- [ ] Step 1: pwn.college — Assembly module
- [ ] Step 1: pwn.college — Shellcode module (shellcode from memory)
- [ ] Step 2: pwn.college — Memory Errors module (first control-flow hijack)
- [ ] Step 2: pwn.college — Format Strings module
- [ ] Step 2: Understand NX, ASLR, canaries from the inside
- [ ] Step 3: ROP Emporium #1 ret2win
- [ ] Step 3: ROP Emporium #2 split
- [ ] Step 3: ROP Emporium #3 callme
- [ ] Step 3: ROP Emporium #4 write4
- [ ] Step 3: ROP Emporium #5 badchars
- [ ] Step 3: ROP Emporium #6 fluff
- [ ] Step 3: ROP Emporium #7 pivot
- [ ] Step 3: ROP Emporium #8 ret2csu
- [ ] Step 3: pwntools used for every chain
- [ ] Step 4: Leak primitives — canary leak via format string / OOB read
- [ ] Step 4: ret2libc with leaked libc base
- [ ] Step 5: how2heap — use-after-free example understood in GDB
- [ ] Step 5: how2heap — double-free example understood in GDB
- [ ] Step 5: how2heap — 2+ "house of..." techniques understood
- [ ] Step 6: Capstone challenge chosen with ALL protections ON (checksec)
- [ ] Step 6: Full chain built: bug → leak → ROP → `/bin/sh`
- [ ] Step 6: Exploit runs reliably 5× against fresh processes

### 🚪 GATE 5 — check all
- [ ] Exploited binary with ASLR + NX + canary all enabled
- [ ] Used a ROP chain (not injected shellcode)
- [ ] Spawned `/bin/sh`
- [ ] Exploit reliable across 5+ runs
- [ ] All 8 ROP Emporium challenges done
- [ ] Can explain canary leak, ASLR bypass, NX→ROP out loud
- [ ] pwn.college core modules complete

**→ Gate 5 passed on: ____________** 🎉 **ALL GATES PASSED**

---

## 🏁 CONSOLIDATION (Months 21–24)

- [ ] Played 4+ CTFs on [CTFtime](https://ctftime.org/) (pwn-focused)
- [ ] Solved 10+ wargame challenges
- [ ] Wrote up 5+ exploits/challenges in a personal notes file
- [ ] Built an exploit portfolio (writeups, tools, scripts — your GitHub)
- [ ] Picked an apex track from the post-24 roadmap
- [ ] Started [10-post-24-months.md](docs/10-post-24-months.md)

---

## 🚀 POST-24-MONTHS CHECKLIST (from docs/10)

- [ ] Built a fuzzing harness (AFL++ or LibFuzzer) and found a real crash
- [ ] Solved a challenge automatically with angr (+ Z3)
- [ ] Traced a real program with Frida
- [ ] Studied Track A (kernel/hypervisor) OR B (browser/JIT) OR C (hardware/baseband) for 3+ months
- [ ] Submitted at least one report to an authorized bug bounty program
- [ ] Published a writeup/blog/talk about your journey

---

## 📝 Monthly Log (write 3 lines at the end of each month)

**Month ____ (phase ____):**
- What I learned: ________________________________________
- What I built/broke: ____________________________________
- Where I was stuck & how I got unstuck: ____________________

**Month ____ (phase ____):**
- What I learned: ________________________________________
- What I built/broke: ____________________________________
- Where I was stuck & how I got unstuck: ____________________

**Month ____ (phase ____):**
- What I learned: ________________________________________
- What I built/broke: ____________________________________
- Where I was stuck & how I got unstuck: ____________________

---

**Feeling stuck?** → [`docs/12-getting-unstuck.md`](docs/12-getting-unstuck.md) · **Need a resource?** → [`docs/03-resources.md`](docs/03-resources.md) · **See the whole map:** [`README.md`](README.md)
