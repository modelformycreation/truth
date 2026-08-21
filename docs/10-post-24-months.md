# 10 · POST-24-MONTHS — The Real World

> **You've passed all 5 gates. This is where you transition from synthetic CTF puzzles to multi-million-line real-world codebases — and from student to professional researcher.**

---

## 🧭 The Transition

CTFs and labs give you *controlled* targets: a known bug in a small binary. The real world gives you:
- Millions of lines of code, no labeled bugs
- Multiple layers of defense (mitigations, sandboxes, monitoring)
- Real constraints: responsible disclosure, legal boundaries, your reputation

The skill you keep: **the same first-principles eye** — logic flows, trust boundaries, state machines, and parsers. Nothing about the fundamentals changes; only the scale and the tooling.

**The meta-skill of this era: finding bugs without reading every line.** That's what the three tool classes below are for.

---

## 1 · Algorithmic Discovery — Automating the Hunt

You will not read 10 million lines of code. You will *aim tools* at them.

### Coverage-Guided Fuzzing
Feed a program millions of mutated inputs; keep the ones that explore new code paths (that's "coverage-guided"); when one crashes — you found a bug.

| Tool | What it is | Free from |
|---|---|---|
| **AFL++** | The standard coverage-guided fuzzer | [https://aflplus.plus/](https://aflplus.plus/) |
| **LibFuzzer** | In-process fuzzing, ships with clang | [https://llvm.org/docs/LibFuzzer.html](https://llvm.org/docs/LibFuzzer.html) |
| **Syzkaller** | Linux **kernel** fuzzing — found thousands of real kernel bugs | [https://github.com/google/syzkaller](https://github.com/google/syzkaller) |

**Practice path:** fuzz your own Phase-4 HTTP server → fuzz open-source parsers (e.g., a JSON or PNG parser) → write a harness for a real library → find your first CVE-grade crash.

### Symbolic Execution
Instead of random inputs, *reason* about code: automatically compute what inputs reach a target line.

| Tool | What it is | Free from |
|---|---|---|
| **angr** | Python binary-analysis framework with symbolic execution | [https://angr.io/](https://angr.io/) |
| **Z3** | The SMT solver that powers symbolic reasoning | [https://github.com/Z3Prover/z3](https://github.com/Z3Prover/z3) |

**Practice path:** use angr to solve a CTF "find the key" challenge automatically — then use it to explore paths you can't reach by hand.

### Dynamic Binary Instrumentation (DBI)
Hook into a running program's memory and trace execution — without recompiling.

| Tool | What it is | Free from |
|---|---|---|
| **Frida** | Runtime hooking/instrumentation (works on Android/iOS too) | [https://frida.re/](https://frida.re/) |
| **DynamoRIO** | Binary translation platform for tracing | [https://dynamorio.org/](https://dynamorio.org/) |

**Practice path:** use Frida to trace a function's arguments/returns in a real app; later, this powers malware analysis and app security testing.

---

## 2 · The 3 Apex Specializations

Pick ONE track to go deep on. All three are funded, in-demand research careers. The fundamentals from the 5 phases apply to every one.

### Track A · Kernel, Hypervisor & Cloud Isolation

**The job:** audit OS kernels (Linux, Windows NT, macOS XNU) and hypervisors (KVM, VMware ESXi, Hyper-V) for guest-to-host escapes and privilege escalation. The prize: ring-0 (or hypervisor-ring) code execution from a user-level bug.

| Resource | Link |
|---|---|
| Kernel exploitation intro (free CTFs) | pwn.college kernel dojos + [https://ctftime.org/](https://ctftime.org/) kernel-pwn writeups |
| Linux kernel docs | [https://www.kernel.org/doc/html/latest/](https://www.kernel.org/doc/html/latest/) |
| Syzkaller (kernel fuzzing) | [https://github.com/google/syzkaller](https://github.com/google/syzkaller) |

### Track B · Browser, JIT Compilers & Language Runtimes

**The job:** exploit JIT compiler optimization nodes, JavaScript engines (V8, JavaScriptCore), and multi-process sandbox escapes. The prize: breaking a sandboxed, memory-safe-by-design environment — the hardest and most prestigious exploit category.

| Resource | Link |
|---|---|
| V8's official docs (how the engine works) | [https://v8.dev/docs](https://v8.dev/docs) |
| Chrome bug tracker / V8 bugs | [https://bugs.chromium.org/p/v8/issues/list](https://bugs.chromium.org/p/v8/issues/list) |
| Browser pwn writeups | [https://ctftime.org/](https://ctftime.org/) (search "chrome", "v8") |

### Track C · Hardware, Embedded, Baseband & Silicon Security

**The job:** hardware fault injection (voltage/clock glitching), electromagnetic side-channel attacks, baseband radio reverse engineering, TrustZone/UEFI firmware auditing. The prize: breaking things no software patch can fix.

| Resource | Link |
|---|---|
| ARM assembly & exploitation (your Phase 2 skills, sharpened) | [https://azeria-labs.com/](https://azeria-labs.com/) |
| Hardware hacking intro | [https://www.bunniestudios.com/blog/?page_id=40](https://www.bunniestudios.com/blog/?page_id=40) (Bunnie's free talks/writings) |
| ChipWhisperer (open-source fault-injection/side-channel hardware+software) | [https://www.newae.com/chipwhisperer](https://www.newae.com/chipwhisperer) |

---

## 3 · Real-World Competition & Bounties

### Capture The Flag — now as a *player*, not a student
- [CTFtime](https://ctftime.org/) — join a team, play 2–4 CTFs, focus on **pwn** (exploitation) categories. Writeups from the top teams are a master's course in exploitation.

### Pwn2Own — the Olympics of exploitation
- Live, in-person zero-day exploitation against Tesla, Chrome, iOS, Android, Windows — with prizes from ~$50k to $500k+ per target, plus the car and the fame.
- You don't "apply to compete" as a beginner; you get *invited* based on demonstrated research. The path: years of Track A/B/C research + a track record of CVEs and CTF wins.

### Responsible Disclosure & Bug Bounties — the realistic first income
- Report bugs you find in **authorized** programs only, following each program's rules.
- Big programs: **Google VRP** ([https://bughunters.google.com/](https://bughunters.google.com/)), **Apple Security Bounty** ([https://security.apple.com/bounty/](https://security.apple.com/bounty/)), plus aggregated platforms: [HackerOne](https://www.hackerone.com/) and [Bugcrowd](https://www.bugcrowd.com/).
- Payouts range from hundreds to **$100k–$1M+** for critical classes (RCE, kernel, sandbox escapes). Realistic expectations: most researchers earn modest amounts from many findings; the headline payouts are rare and earned by years of deep work.
- **This is the legal, career-building way to monetize everything you've learned.** Never test a system without authorization — ever.

---

## 4 · The Ultimate Philosophical Shift — Breaker → Architect

After 24+ months you hold a deep structural insight: you know *why* whole classes of vulnerabilities exist — because systems parse untrusted input, because memory is a shared resource, because trust boundaries were drawn wrong.

That insight has a second career mode: **Architect**. People who can break systems are uniquely qualified to design systems that *cannot be broken in those ways*:

- Redesigning parsers so instructions and data are never confused (LangSec, your Phase 4 expertise)
- Designing memory-safe architectures and OS isolation primitives
- Building toolchains that eliminate whole vulnerability classes
- Writing the next generation of operating systems, hypervisors, and programming languages

The world's most respected security engineers end their careers here: from **Breaker** to **Architect**. Everything in this framework is the entry ramp to that path.

---

## 💼 Career Destinations (what this skill set gets you)

| Role | What you'd do |
|---|---|
| Exploit developer / security researcher | Find and weaponize bugs (vendors, research labs, Pwn2Own teams) |
| Security engineer (offensive) | Red-team, penetration testing at depth, product security |
| Reverse engineer / malware analyst | Disassemble malicious software and firmware (Phase 2 skills, forever) |
| Bug bounty hunter | Independent research on authorized programs |
| OS/kernel security engineer | Track A: harden or break kernels for the vendors who make them |
| Browser/runtime security engineer | Track B: V8/JavaScriptCore/WebKit teams |
| Hardware/firmware security engineer | Track C: silicon vendors, automotive, IoT |
| Architect / language designer | The philosophical shift: build the systems that end vulnerability classes |

---

## ✅ The Final Checklist for This Era

- [ ] Built a fuzzing harness and found a real crash (AFL++ or LibFuzzer)
- [ ] Solved a CTF challenge automatically with angr
- [ ] Traced a real program with Frida
- [ ] Picked an apex track (A, B, or C) and studied it for 3+ months
- [ ] Played 4+ CTFs on a team
- [ ] Submitted at least one report to an authorized bug bounty program
- [ ] Wrote up your journey — a blog, a talk, or a public writeup (this is how Pwn2Own teams find you)

---

**Back to the map:** [`README.md`](../README.md) · **Track your journey:** [`PROGRESS.md`](../PROGRESS.md) · **Never stuck:** [`12-getting-unstuck.md`](12-getting-unstuck.md)
