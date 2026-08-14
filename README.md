# TRUTH — The Ultimate Hacker Mastery Framework

> **A complete, free, step-by-step blueprint to go from absolute beginner to world-class security researcher in 24 months.**
> Everything is verified, free, and laid out in order — so you never have to wonder *"what do I do next?"* again.

---

## 🗺️ The Whole Journey in One Picture

```
START (absolute beginner, no experience needed)
   │
   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 1 · Computer Architecture & Low-Level C             (Mon 1–4) │
│  → Learn C, pointers, memory. Build your own malloc().               │
│  GATE: your own malloc()/free() works without crashing              │
└─────────────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 2 · Assembly & Reverse Engineering                   (Mon 5–8) │
│  → Read machine code. Crack binaries. Play Microcorruption.          │
│  GATE: extract a hidden key from a mystery binary, no source code    │
└─────────────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 3 · Operating System Internals & Kernel Boundaries   (Mon 9–12)│
│  → Syscalls, Ring 0 vs Ring 3, modify the xv6 kernel.               │
│  GATE: add a custom syscall to xv6 + manage page tables             │
└─────────────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 4 · Wire-Level Networking & Parser Theory            (Mon 13–15)│
│  → Raw sockets, RFCs, packet sniffing. Write a server in pure C.     │
│  GATE: parse raw network bytes + handle TCP states with no libraries │
└─────────────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 5 · Vulnerability Research & Binary Exploitation     (Mon 16–20)│
│  → pwn.college, ROP, heap exploitation. Beat modern protections.     │
│  GATE: exploit a protected binary (ASLR+NX+canary) → ROP → shell     │
└─────────────────────────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CONSOLIDATION — CTFs, wargames, portfolio                  (Mon 21–24)│
└─────────────────────────────────────────────────────────────────────┘
   │
   ▼
POST-24-MONTHS · The real world — fuzzing, kernel/browser/hardware
research tracks, bug bounties, Pwn2Own, Breaker → Architect.
```

---

## 🧭 How to Use This Repo (read this first)

1. **Read `docs/01-what-is-hacking.md`** — 10 minutes. Understand what hacking actually is (and isn't).
2. **Read `docs/02-the-5-domains.md`** — 10 minutes. This is the knowledge skeleton every later phase builds on.
3. **Read `docs/04-mindset-and-schedule.md`** — 15 minutes. Set up your daily schedule and mental rules *before* you start.
4. **Open `docs/05-phase-1.md`** and start Step 1. **Do not look at later phases until you pass each gate.** Each phase is self-contained with exact steps, weekly milestones, and an exit test.
5. **Tick off every box in `PROGRESS.md`** as you go. That file is your personal GPS — it tells you exactly where you are and what's left.
6. **Whenever you feel stuck**, open `docs/12-getting-unstuck.md` before you do anything else. It exists so you never stall out.

> ⚡ **Your first single step today (takes 5 minutes):**
> Open **[Compiler Explorer (godbolt.org)](https://godbolt.org/)** → select C on the left → write this:
> ```c
> int add(int a, int b) {
>     return a + b;
> }
> ```
> → look at the assembly on the right. You just saw your first C function become machine code.
> That's Phase 1, Day 1. Then come back and read `docs/05-phase-1.md`.

---

## 📚 The Map of This Repo

| File | What it is | Read when |
|---|---|---|
| [`README.md`](README.md) | **You are here.** The master map + quick start | Now |
| [`docs/01-what-is-hacking.md`](docs/01-what-is-hacking.md) | The truth of hacking: what it is, who does it, what's possible | Day 1 |
| [`docs/02-the-5-domains.md`](docs/02-the-5-domains.md) | The 5 non-negotiable technical domains (the knowledge skeleton) | Day 1 |
| [`docs/03-resources.md`](docs/03-resources.md) | **The master resource vault** — every free, verified link, sorted by job | Whenever you need a resource |
| [`docs/04-mindset-and-schedule.md`](docs/04-mindset-and-schedule.md) | Time plan, daily schedule, 4 learning hacks, mental rules | Before Day 1 |
| [`docs/05-phase-1.md`](docs/05-phase-1.md) | Phase 1: Architecture & Low-Level C (Months 1–4) | When starting |
| [`docs/06-phase-2.md`](docs/06-phase-2.md) | Phase 2: Assembly & Reverse Engineering (Months 5–8) | After Phase 1 gate |
| [`docs/07-phase-3.md`](docs/07-phase-3.md) | Phase 3: OS Internals & Kernel (Months 9–12) | After Phase 2 gate |
| [`docs/08-phase-4.md`](docs/08-phase-4.md) | Phase 4: Networking & Parser Theory (Months 13–15) | After Phase 3 gate |
| [`docs/09-phase-5.md`](docs/09-phase-5.md) | Phase 5: Vulnerability Research & Exploitation (Months 16–20) | After Phase 4 gate |
| [`docs/10-post-24-months.md`](docs/10-post-24-months.md) | The real world: fuzzing, 3 research tracks, bounties, Pwn2Own | Months 21+ |
| [`docs/11-glossary.md`](docs/11-glossary.md) | Plain-English definitions of every technical term in this repo | Anytime you see a strange word |
| [`docs/12-getting-unstuck.md`](docs/12-getting-unstuck.md) | Troubleshooting, communities, "I'm stuck / I'm lost / I'm not good enough" | Anytime you stall |
| [`PROGRESS.md`](PROGRESS.md) | **Your personal checklist** — every step and gate, with tick boxes | Every day |

---

## 🚦 The 5 Phases at a Glance (the "don't skip" rule)

| # | Phase | Months | The Gate (you may NOT continue until you pass it) |
|---|---|---|---|
| 1 | Computer Architecture & Low-Level C | 1–4 | Write a custom `malloc()` + `free()` in C that works without crashing |
| 2 | Assembly & Reverse Engineering | 5–8 | Reverse a mystery binary in GDB/Ghidra and extract a hidden key — no source code |
| 3 | OS Internals & Kernel Boundaries | 9–12 | Add a new custom syscall to xv6 and manage virtual-memory page tables |
| 4 | Wire-Level Networking & Parser Theory | 13–15 | Parse raw network byte streams in C and handle TCP states with no high-level libraries |
| 5 | Vulnerability Research & Binary Exploitation | 16–20 | Exploit a binary with ASLR + NX + canary: craft a ROP chain that spawns `/bin/sh` |

**The rules that make this work:**
- Phases are **strictly sequential**. Do not jump ahead. Each phase assumes the previous gate.
- The **gates matter more than the calendar**. If a phase takes you 6 months instead of 4, that's fine. If you pass a gate early, move on early.
- Do **not** skip the theory in Phase 4 (parser theory / LangSec). It is the single most-underrated skill in the whole framework and it's what separates hackers from script-kiddies.

---

## ⏱️ The Time Commitment (the honest numbers)

| Item | Value |
|---|---|
| Total timeline | 18–24 months |
| Total focused hours | ~2,500 |
| Daily commitment | 3.5 hours, 6 days/week (1 rest day) |
| Daily split | 60 min theory · 90 min coding · 60 min labs/debugging |

All links and resources in this repo are **100% free** — no paid courses, no subscriptions, no university logins. Every link was **verified live on 2026-08-14**.

---

## ⚖️ Ethics & Legality (read once, remember always)

This framework teaches **defensive security research and exploitation for education**. Use every skill here only on:

- Your **own machines and virtual machines**
- **Explicitly authorized** practice platforms (CTF sites, pwn.college, crackmes, wargames, bug-bounty programs with rules of engagement)
- Systems you have **written permission** to test

Breaking into systems you don't own is a crime in virtually every country. The best hackers in the world got there by breaking **authorized** things — never by breaking the law. The post-24-month section explains the legitimate, highly-paid career paths this skill set leads to.

---

## ✅ What "Done" Looks Like

When you've passed all 5 gates, you are a **capable binary/security researcher**: you can read machine code, understand kernels, speak protocols, and break modern mitigations. You then move to `docs/10-post-24-months.md` for fuzzing, the three research tracks, bounties, and the Breaker→Architect transition.

**Start today: `docs/01-what-is-hacking.md`.**
