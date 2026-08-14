# 06 · PHASE 2 — Assembly Language & Reverse Engineering

> **Months 5–8 · Learn to read machine code the way you read English.**
> **GATE: Reverse-engineer a mystery compiled binary inside GDB/Ghidra and extract a hidden key — without reading any C source code.**

---

## 🎯 What you'll be able to do by the end of this phase

- Read x86_64 (and starter ARM) assembly fluently — you can follow a function's logic instruction by instruction
- Use GDB like a native: breakpoints, single-stepping, examining registers and memory
- Use Ghidra: disassemble, decompile, navigate, and annotate a binary
- Crack beginner-to-intermediate crackmes on [crackmes.one](https://crackmes.one/) without source code
- Defuse the legendary CMU **Bomb Lab** (the classic "learn assembly or die" exercise)
- Complete Microcorruption levels 1–10 (browser-based MSP430 RE game)

---

## 📋 Prerequisites

- **PASSED the Phase 1 gate** (your own `malloc()`/`free()` working).
- Comfortable compiling C and reading Godbolt output.
- GDB installed (from Phase 1 toolchain).

---

## ⏱️ Duration

- **~4 months** at 3.5h/day, 6 days/week.
- The first 2 months are skill-building; the last 2 months are pure practice until the gate.

---

## 👣 The Steps (do them in this exact order)

### Step 1 — The x86_64 assembly foundation (Month 5)
- Read **RE4B** ([beginners.re](https://beginners.re/), free PDF — English) chapters in order. Don't read it cover-to-cover like a novel: read a chapter, then *do* the Godbolt experiment for it.
- Every concept gets the **dual-pane treatment**: write the C on godbolt.org, observe the assembly, identify the pattern (prologue, loop, if/else, function call, return).
- Install the mental model of the **calling convention**: `RDI`, `RSI`, `RDX`, `RCX`, `R8`, `R9` = first 6 args; `RAX` = return value; `RSP`/`RBP` manage the stack frame.

### Step 2 — Master GDB (Month 5)
- GDB is your microscope for the rest of your life. Learn by doing:
  ```bash
  gdb ./hello
  (gdb) break main          # stop at main
  (gdb) run                 # start the program
  (gdb) disassemble main    # see the assembly
  (gdb) stepi               # execute ONE instruction
  (gdb) info registers      # watch RIP, RAX, RSP change
  (gdb) x/16gx $rsp         # examine 16 words of memory at the stack pointer
  ```
- Install GDB-peda or pwndbg (free GDB enhancement for exploitation later): `pip install pwndbg` / `git clone https://github.com/pwndbg/pwndbg`.

### Step 3 — Bomb Lab (Month 6)
- Download the free **Bomb Lab binary** from [http://csapp.cs.cmu.edu/3e/labs.html](http://csapp.cs.cmu.edu/3e/labs.html) (the `bomb.tar` self-study link, run with `-q`).
- It's 6 "phases" — each one needs a correct input string found by disassembling/debugging.
- **Rules for yourself:** no cheating by looking at strings in the binary first; use GDB. This is the single best assembly exercise ever designed.

### Step 4 — Microcorruption levels 1–10 (Month 6)
- [https://microcorruption.com/](https://microcorruption.com/) — browser-based, free, zero install.
- Each level is a lock that needs "unlocking" by understanding its MSP430 assembly and finding the input that bypasses the check.
- The built-in debugger teaches you breakpoints, stepping, and memory inspection — all in a fun puzzle wrapper.
- **Levels 1–4** teach the mechanics. **Levels 5–10** start requiring real thinking. If you're stuck on a level for 2 days, that's normal — see Stuck? below.

### Step 5 — RE4B middle chapters + Ghidra (Month 7)
- Continue RE4B: switch statements, loops, strings, arrays, structures, and C++ basics in assembly.
- Install **Ghidra** ([ghidra-sre.org](https://ghidra-sre.org/), free, NSA): import a binary, let it auto-analyze, use the decompiler to get C-like pseudocode, then *verify the pseudocode against the actual assembly* (the decompiler is a hint, not ground truth).
- **Practice drill:** compile your own C programs with `-O0`, `-O2`, and `-s` (stripped), open them in Ghidra, and reconstruct what they do. Do this with 10 programs of increasing complexity.

### Step 6 — Crackmes.one, one per week (Months 7–8)
- [https://crackmes.one/](https://crackmes.one/) → search → **sort by difficulty: 1.x** (easiest) first.
- Downloads are password-protected archives; the password is `crackmes.one` (shown on the site).
- **Method for every crackme:**
  1. `file crackme` → what architecture/platform is it?
  2. `strings crackme` → any obvious clues? (but don't stop at strings — that's the shallow win)
  3. Load in Ghidra → find `main` → understand the check logic
  4. Verify your understanding in GDB by setting a breakpoint at the check and watching inputs
  5. Produce the correct input (key/password/serial) that makes it pass
- Write a short writeup for each crackme (even 5 lines) — you'll reference these later.

### Step 7 — ARM introduction (Month 8, parallel)
- **Azeria Labs** ([azeria-labs.com](https://azeria-labs.com/)) — the free ARM assembly tutorial series.
- Why: the world runs on ARM (phones, IoT, embedded, Apple Silicon). Being bilingual (x86 + ARM) makes you a researcher, not a x86-only hobbyist.
- Do the *Writing ARM Assembly* and *ARM Data Types & Registers* series; skim the exploitation series (you'll return in Phase 5/Track C).

---

## 🚪 THE GATE — Phase 2 Exit Test

> **The gate is a real test, set up by you:**
> 1. Download a **medium-difficulty crackme** (difficulty 2.x–3.x) on crackmes.one that you have never seen.
> 2. **Do not read its writeup.** Do not look at the source if one is attached.
> 3. Reverse it in GDB/Ghidra and **extract the hidden key/password/serial**.

- [ ] I extracted the key without reading any C source code
- [ ] I can explain, out loud, the binary's check logic (what it compares, where, how)
- [ ] I have completed Microcorruption levels 1–10 (or an equivalent: 6+ crackmes)
- [ ] I can read a 30-line x86_64 function and summarize what it does in plain English
- [ ] I can use GDB to inspect registers, memory, and breakpoints without looking anything up
- [ ] I have completed Bomb Lab (all 6 phases) — or an equivalent hard RE exercise

**Passed?** → [Phase 3](07-phase-3.md). **Not yet?** → More crackmes. The gate is a skill test, not a knowledge test — the only cure is reps.

---

## ⚠️ Common Mistakes (avoid these)

| Mistake | Why it's fatal | Fix |
|---|---|---|
| Relying on Ghidra's decompiler as ground truth | The decompiler lies sometimes; you'll build false models | Always verify against real assembly in GDB |
| Reading writeups before trying | Your brain mistakes recognition for ability | 2 full days of struggle → then (and only then) peek at a hint |
| Skipping the ARM track | You become x86-only, but the world is mostly ARM | Azeria Labs, 1 hour/week from month 8 |
| Only using `strings` to crack | You learn a trick, not a skill | Ban yourself from `strings` for 2 weeks — do it all in GDB |
| Memorizing instructions | Instructions are vocabulary, not understanding | Understand *patterns*: prologues, loops, calls, returns |
| Skipping Bomb Lab | It's the best RE workout ever designed | Do it. All 6 phases. Your future self thanks you |

---

## 🆘 Stuck? Do this

1. **Can't find main in Ghidra?** Look for `entry` → it calls `__libc_start_main(main, ...)`. Or use `nm`/`readelf` on non-stripped binaries. Stripped? Look for the function that calls other functions and has a lot of references.
2. **Crackme won't crack after 2 days?** You may have picked one that's too hard. Pick a difficulty 1.x–2.x, or read the crackme's *metadata* (platform, arch) and make sure you're checking the right thing. Then, after 2 days: peek at *one* hint from the writeup — just one.
3. **Microcorruption level stuck?** Remember the debugger is yours: set a breakpoint at the unlock-check and *feed it different inputs* to learn what it expects. Watch how it compares byte by byte.
4. **Assembly reading slow?** That's normal for 2 months. Speed comes from volume. Do 3 small Godbolt experiments per day; in 60 days you'll read assembly nearly as fast as C.
5. **Bomb Lab phase 4 recursion confusing?** Trace it by hand on paper with a small input, or watch a LiveOverflow primer on recursion in assembly.

---

## 🔗 Bridge to Phase 3

You can now read machine code and understand what programs do without source. **Phase 3 goes one layer deeper** — beneath individual programs, to the operating system that runs them: syscalls, privilege rings, page tables. Now that you can read code, you'll learn to read the kernel.

→ **[07-phase-3.md](07-phase-3.md)**
