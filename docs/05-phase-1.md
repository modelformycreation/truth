# 05 · PHASE 1 — Computer Architecture & Low-Level C

> **Months 1–4 · The foundation. Nothing after this works without it.**
> **GATE: Write a custom `malloc()` and `free()` memory allocator in C from scratch — and it must work without crashing.**

---

## 🎯 What you'll be able to do by the end of this phase

- Explain exactly what happens when a C program runs: registers, stack, heap, pointers — with a visual mental model
- Read compiler output on godbolt.org and understand what the CPU is being told to do
- Write non-trivial C that uses pointers, structs, and manual memory management without crashes or leaks
- Build a working memory allocator (the same core problem the real `malloc` solves)
- (Optional but recommended) Have built a computer from NAND gates upward in simulation (Nand2Tetris)

---

## 📋 Prerequisites

- **None technical.** Just: a computer, curiosity, and the schedule from `docs/04-mindset-and-schedule.md`.
- No prior programming required — but if you already know some C, this phase goes faster. Don't skip it anyway (the *depth* is the point).

---

## ⏱️ Duration

- **~4 months** at 3.5h/day, 6 days/week.
- If you're brand new to programming, budget up to 5–6 months. **The gate matters more than the calendar.**

---

## 👣 The Steps (do them in this exact order)

### Step 1 — Set up your environment (Day 1, ~1–2 hours)
- Pick one Linux setup from [`03-resources.md`](03-resources.md) Part A (WSL2, VirtualBox, or just start in pwn.college's free browser terminal).
- Install the toolchain: `build-essential`, `gdb`, `python3`.
- Verify: `gcc --version` works, and you can compile and run a hello-world C program.
- **Done when:** `gcc hello.c -o hello && ./hello` prints "hello".

### Step 2 — The Godbolt daily habit (every day of this phase)
- Open [godbolt.org](https://godbolt.org/) every day.
- Start: write the 3-line `add` function from the README. Look at the assembly.
- Each day, compile the *smallest* thing you wrote that day and study its assembly for 10 minutes.
- This is Learning Hack #1 — it costs 10 minutes and compounds enormously.

### Step 3 — Learn C properly (Months 1–2)
Read + do, don't just read. For every concept, open Godbolt and inspect what the compiler does.

| Concept | Must master |
|---|---|
| Variables, types, functions, control flow | The basics — fast |
| **Pointers** | What an address is, `&` and `*`, pointer arithmetic (`ptr + 1` = next element, not next byte) |
| **Memory layout** | Stack vs heap, where locals live, where `malloc`'d memory lives |
| **Structs** | Compound types, layout in memory, alignment |
| **Arrays & strings** | C strings = `char*` + `\0`. No magic — a string is bytes in memory |
| **Manual memory management** | `malloc`, `free`, and the discipline of ownership |

Resources:
- **CS:APP (Computer Systems: A Programmer's Perspective)** chapters 1–3 are the gold standard for "how C meets hardware" — read alongside the labs. The book itself is commercial, but the [labs](http://csapp.cs.cmu.edu/3e/labs.html) are free; the concepts are all covered by free alternatives if you can't get the book (e.g., [Beej's Guide to C](https://beej.us/guide/bgc/), free online).
- Use [LiveOverflow](https://www.youtube.com/c/LiveOverflow/playlists) videos as 10-minute primers (Learning Hack #2) before dense reading.
- Ask specific questions on Stack Overflow when truly stuck (see `docs/12-getting-unstuck.md`).

### Step 4 — CS:APP Data Lab (Month 2)
- Download the **Data Lab self-study handout** from [http://csapp.cs.cmu.edu/3e/labs.html](http://csapp.cs.cmu.edu/3e/labs.html) (no account needed).
- It's a set of bit-level puzzles: implement functions like `abs`, `bitCount`, `float_i2f` using only bitwise operators.
- **Why:** it forces you to think in bits — the level where all of computing actually happens.
- **Done when:** all puzzles pass `./driver.py` (or `btest`).

### Step 5 — (Recommended) Nand2Tetris (Months 2–3, part-time)
- [https://www.nand2tetris.org/](https://www.nand2tetris.org/) — free lectures + projects.
- Build a simulated computer from NAND gates → logic gates → ALU → CPU → assembler → compiler → OS.
- **Why:** you'll *construct* the Von Neumann machine instead of just reading about it. This installs the deepest possible mental model of Domain 1.
- If time is tight: do projects 1–6 (gates through assembler) and skim the rest.

### Step 6 — CS:APP Malloc Lab (Months 3–4)
- Download the **Malloc Lab** from the same [labs page](http://csapp.cs.cmu.edu/3e/labs.html).
- Implement your own `malloc`, `free`, and `realloc` using an implicit (then explicit) free list.
- Test with the provided `mdriver` — it checks correctness *and* performance.
- **Why:** this is THE canonical "understand memory for real" assignment in all of CS education.

### Step 7 — Write your allocator from scratch, alone (Gate prep, Month 4)
- Close the lab handout. Write a fresh `malloc()`/`free()` in C **from scratch** — your own design (e.g., a free list with a header containing size + next pointer).
- Write your own test program: allocate many objects of varied sizes, free them in random order, allocate again, check for crashes and corrupted metadata.
- Compile with `-fsanitize=address` — if ASan reports nothing and your tests pass, you're solid.

---

## 🚪 THE GATE — Phase 1 Exit Test

> **You pass Phase 1 when all of these are true:**

- [ ] I wrote `malloc()` and `free()` myself (no copying from the handout) and they work without crashing
- [ ] My allocator handles: allocation of many sizes, `free` in any order, re-allocation after frees (no crashes, no obvious corruption)
- [ ] I can explain, out loud, where a local variable, a `malloc`'d block, and the return address live in memory
- [ ] I can look at any 10-line C function on godbolt.org and identify the prologue, the body, and the epilogue in the assembly
- [ ] Data Lab puzzles pass (if you did it) — or equivalent bit-level competence
- [ ] I have a `PROGRESS.md` entry: Phase 1 checked

**Passed?** → Move to [Phase 2](06-phase-2.md). **Not yet?** → That's fine, re-read the "Stuck?" section below.

---

## ⚠️ Common Mistakes (avoid these)

| Mistake | Why it's fatal | Fix |
|---|---|---|
| Skipping pointers until "later" | Pointers ARE the subject of this phase | Spend the extra 2 weeks. There is no later |
| Copy-pasting malloc lab code from the internet | You learn nothing; the gate will expose you | Write every line yourself. Struggle is the curriculum |
| Not using Godbolt daily | The C↔assembly mapping never gets installed | 10 min/day, non-negotiable |
| Skipping the debugger (GDB) | You can't see memory → you can't believe memory | Every crash = a GDB session, always |
| Optimizing for speed instead of correctness | The gate tests "doesn't crash", not "fastest" | Correct first. Fast later |
| Starting Phase 2 before the gate | Everything in Phase 2 assumes you can read memory | No gate, no phase 2. That's the rule |

---

## 🆘 Stuck? Do this (never sit stuck for more than 2 days)

1. **Segfault you can't explain?** Run it in GDB: `gdb ./program`, `run`, then `bt` (backtrace) and `info locals`. The crash will tell you exactly where and why. GDB is your teacher.
2. **Pointer concept not clicking?** Watch a 10-min LiveOverflow/Ben Eater video (Learning Hack #2), then draw the memory diagram on paper with addresses on the left, values on the right.
3. **Data Lab puzzle stuck?** Reduce it: implement a simpler version that works for 50% of inputs, then extend. Never try to solve the full puzzle at once.
4. **malloc lab corrupted heap?** Add a `printf` of the free-list pointers after every operation. Print the heap state after each `malloc`/`free` until you see exactly where it diverges.
5. **Feeling lost generally?** Re-read `docs/12-getting-unstuck.md` — it has the full procedure, the communities to ask in, and the "signs you're actually progressing" section.

---

## 🔗 Bridge to Phase 2

You now understand how memory works and how C becomes machine code. **Phase 2 flips the direction:** instead of writing C and looking at assembly, you'll start with *only* the assembly and reconstruct what the program does. That's reverse engineering — and it's the core skill for everything from malware analysis to exploiting closed-source software.

→ **[06-phase-2.md](06-phase-2.md)**
