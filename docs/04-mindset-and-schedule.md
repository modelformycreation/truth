# 04 · Mindset, Time Parameters & Accelerated Learning

> **Reading time: ~15 minutes. Set up your schedule and mental rules BEFORE you start Phase 1 — this is what keeps you from quitting in month 2.**

---

## Part 1 · The 4 Cognitive Postures

These are your permanent mental rules. They are not motivational quotes — they are operating instructions.

### 1. Zero-Abstraction Tolerance
Never accept "it just works." Every time you use a tool, a library, or a framework, ask: *what is actually happening underneath?* Know what memory addresses and registers are moving, even when the tool hides them. If you cannot explain a layer, you don't own it yet.

### 2. High Friction Tolerance
Hacking is a high-friction activity. **Expect** to spend 10 hours in a debugger analyzing a single byte-offset error. This is not a sign you're failing — it is the actual work. People who quit are the ones who expected low friction. Reframe: *every stuck hour is where the learning happens.*

### 3. Build-Before-Break Axiom
Never exploit what you haven't built. Write the custom heap allocator in C **before** attempting a heap exploit. Write the network socket server **before** attempting network exploitation. Builders become elite breakers because they know exactly where the seams are.

### 4. Epistemic Humility
Your mental model is wrong until the debugger proves it right. When your exploit doesn't work, the bug is *your model*, not the computer's. Assume nothing; verify everything with actual evidence (register values, memory dumps, packet captures).

---

## Part 2 · The Time Commitment Framework

| Parameter | Value |
|---|---|
| Total timeline | **18–24 months** (~2,500 focused hours) |
| Daily commitment | **3.5 hours/day**, 6 days/week (1 rest day) |
| Rest day | Mandatory. Your brain consolidates memory during rest — skipping it makes you slower, not faster |

### The Daily Block Allocation (3.5 hours)

| Block | Duration | What you do |
|---|---|---|
| 🔵 Theory Reading | 60 min | CS:APP, RE4B, RFCs — the dense material |
| 🟢 Manual C & Assembly Coding | 90 min | Writing code yourself. No copy-paste from tutorials |
| 🔴 Destructive Debugging & CTF Labs | 60 min | GDB sessions, cracking binaries, pwn challenges — the "break things" hour |

**Order matters:** theory first (context), then build (practice), then break (test yourself). The three blocks reinforce each other.

### The Week (6 days)

| Day | Focus |
|---|---|
| Day 1–2 | Theory + coding (heavy reading days) |
| Day 3–4 | Coding + labs (heavy hands-on days) |
| Day 5 | Labs + a review of the week's cheat-sheet notes |
| Day 6 | A bigger chunk: one long lab session (e.g., a full CTF challenge or a full Microcorruption level) |
| Day 7 | **Rest.** No screens. Let it consolidate |

---

## Part 3 · The 4 Accelerated Learning Hacks

These four techniques compress months off your timeline. Use all four, every week.

### Hack 1 · The Visual Dual-Pane Hack
Open [godbolt.org](https://godbolt.org/). Type 3 lines of C on the left. Watch the assembly generate on the right in real time. Change the compiler flags (`-O0` vs `-O2`) and watch the assembly change.
> **Why it works:** you see the abstract (C) and the concrete (assembly) simultaneously. Your brain builds the mapping automatically. Do this for *every* C concept you meet.

### Hack 2 · The 10-Minute Video Primer First
Before reading a dense textbook chapter (CS:APP, RE4B, an RFC), watch a 10-minute [LiveOverflow](https://www.youtube.com/c/LiveOverflow/playlists) (or similar) video on the topic.
> **Why it works:** the video installs a visual mental model first; the dense text then fills in details *into an existing structure* instead of building from zero. You'll read 3× faster and retain more.

### Hack 3 · The Debugger-First Inspection Loop
Run every program inside GDB and use `stepi` (step one instruction) to watch `RAX`, `RSP`, `RIP` mutate live.
> **Why it works:** you see memory and registers as real, physical things — not abstractions. After 50 `stepi` sessions, "the stack" is a place you've visited, not a diagram you memorized.
> ```bash
> gdb ./your_program
> (gdb) break main
> (gdb) run
> (gdb) stepi
> (gdb) info registers   # watch RAX, RSP, RIP change
> ```

### Hack 4 · The 1-Page Cheat Sheet Rule
Keep pinned in browser tabs at all times: the **Linux Syscall Table**, an **x86_64 assembly guide**, and a **GDB command sheet** (all linked in [03-resources.md](03-resources.md), Part E).
> **Why it works:** you never context-switch to a search engine to recall basic syntax. Reference overhead goes to zero; all your working memory goes to the actual problem.

---

## Part 4 · The Month-by-Month Map

This is the approximate calendar. **Gates matter more than dates** — but this tells you roughly where you should be.

| Month | Phase | Milestone you should reach |
|---|---|---|
| 1 | 1 | Toolchain set up. C basics done. Godbolt habit daily. Data Lab started |
| 2 | 1 | Data Lab complete. Reading CS:APP ch. 1–3 |
| 3 | 1 | Malloc Lab in progress. Stack/heap model fully visual in your head |
| 4 | 1 | **GATE 1: own malloc()/free() works.** Nand2Tetris (optional) done or in progress |
| 5 | 2 | RE4B ch. 1–3. GDB comfortable. Microcorruption levels 1–5 |
| 6 | 2 | RE4B ch. 4–6. Bomb Lab (from CS:APP). Microcorruption levels 6–10 |
| 7 | 2 | Crackmes.one — beginner tier, one per week |
| 8 | 2 | **GATE 2: mystery binary cracked, key extracted, no source.** ARM track started (Azeria) |
| 9 | 3 | Syscall study done. xv6 up and running. Lab: util done |
| 10 | 3 | xv6 labs: syscall, pgtbl (page tables) |
| 11 | 3 | xv6 labs: traps, cow |
| 12 | 3 | **GATE 3: custom syscall added + page tables managed.** Remaining xv6 labs as stretch |
| 13 | 4 | TCP/IP + Wireshark. Beej's sockets guide |
| 14 | 4 | Raw packet sniffer in C. RFC 9293 sections |
| 15 | 4 | Pure-C HTTP server. **GATE 4: raw bytes parsed, TCP states handled** |
| 16 | 5 | pwn.college: Program Interaction → Assembly → Shellcode |
| 17 | 5 | pwn.college: Format Strings, Memory Errors. First buffer overflow |
| 18 | 5 | ROP Emporium challenges 1–4 |
| 19 | 5 | ROP Emporium 5–8. how2heap: UAF, double-free, first house-of... |
| 20 | 5 | **GATE 5: ROP chain vs ASLR+NX+canary spawns /bin/sh** |
| 21–24 | Consolidation | CTFs on [CTFtime](https://ctftime.org/), wargames, your exploit portfolio, transition to [10-post-24-months.md](10-post-24-months.md) |

---

## Part 5 · Anti-Quitting Rules

1. **Progress is measured in gates, not feelings.** On bad days, open `PROGRESS.md` and tick one small box. Small wins are the engine.
2. **Never skip the rest day.** Burnout is the #1 reason people quit. The framework is designed for 6 days/week, not 7.
3. **Stuck > 2 days? Change tools, not goals.** If you've been stuck on one challenge for 2+ days, re-read `docs/12-getting-unstuck.md` — there is a specific procedure for every stuck situation.
4. **Do not compare with others.** Compare with your `PROGRESS.md` from 30 days ago. The only race is with your past self.
5. **Every expert was once stuck on the same thing you're stuck on.** The debugger does not judge. It just shows you what's true.

**Next:** [`05-phase-1.md`](05-phase-1.md) — Phase 1 begins. Good luck — and start today.
