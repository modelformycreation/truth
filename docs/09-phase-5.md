# 09 · PHASE 5 — Vulnerability Research & Binary Exploitation

> **Months 16–20 · Everything before this becomes weapons. Break real binaries protected by real mitigations.**
> **GATE: Discover a memory-corruption flaw in a binary with modern protections (ASLR, NX, Canary), construct a ROP chain payload, and spawn a root shell (`/bin/sh`).**

---

## 🎯 What you'll be able to do by the end of this phase

- Work sequentially through the best free exploitation curriculum on Earth (pwn.college)
- Write and debug shellcode by hand
- Exploit format-string vulnerabilities to leak memory and write arbitrary values
- Perform buffer-overflow attacks against stack protections
- Build Return-Oriented Programming chains (ROP Emporium, all 8 challenges)
- Understand and exploit glibc heap bugs: use-after-free, double-free, and the "house of..." family (how2heap)
- Bypass the modern protection trio — **ASLR, NX/DEP, Stack Canaries** — in a single full exploit chain
- Use pwntools to script exploit development

---

## 📋 Prerequisites

- **PASSED the Phase 4 gate** (raw packet parsing + pure-C HTTP server).
- Comfortable reading assembly (Phase 2), knowing memory layout (Phase 1), and using GDB.
- Recommended: re-read `docs/02-the-5-domains.md` Domain 5 — this phase *is* that domain.

---

## ⏱️ Duration

- **~5 months** at 3.5h/day, 6 days/week. The longest phase — because it's the payoff.

---

## 👣 The Steps (do them in this exact order)

### Step 1 — pwn.college, the early modules (Month 16)
- Create a free account at [pwn.college](https://pwn.college/) (GitHub login works) — you get free in-browser Linux terminals.
- Follow the platform's suggested order. The classic sequence starts:
  1. **Program Interaction** — reading/writing programs over pipes; the basics of "talking" to a binary
  2. **Assembly** — pwn.college's own assembly fundamentals (great reinforcement of Phase 2)
  3. **Shellcode** — write raw machine code that spawns `/bin/sh`
- **Done when:** you can write shellcode for a challenge without looking at references.

### Step 2 — Memory errors & format strings (Month 17)
- pwn.college modules: **Memory Errors** (buffer overflows — the first time you hijack control flow), **Format Strings** (leaking stack memory and writing arbitrary values through `printf` bugs).
- Study how the protection trio works, from the inside:
  - **NX/DEP** — the stack is non-executable: you cannot run injected shellcode from the stack
  - **ASLR** — addresses are randomized each run: you don't know where anything is
  - **Canaries** — a random value sits before the saved return address: if you overwrite past it, the program detects corruption and aborts
- **Done when:** you've done your first real ret2win / shellcode-overflow with ASLR off, NX off.

### Step 3 — ROP Emporium, challenges 1–8 (Month 18)
- [ropemporium.com](https://ropemporium.com/) — the world's best ROP tutorial, each challenge has a written guide.
- Do them **in order**: `ret2win → split → callme → write4 → badchars → fluff → pivot → ret2csu`.
- Core skill: **gadgets** — small instruction sequences ending in `ret` already present in the binary (or its libraries). Chain them by stacking return addresses: each `ret` pops the next address and jumps to it. You build "code" from the program's own instructions, so NX can't stop you.
- Use **pwntools** ([docs.pwntools.com](https://docs.pwntools.com/)) to script your chains: `ROP(objdump)`, `p64()` packing, `process()`/`remote()`.

### Step 4 — Beating ASLR & Canaries (Month 19, weeks 1–2)
- You can't jump to an address you don't know (ASLR) and you can't blindly overwrite past the canary.
- The standard answers, which you will now learn:
  - **Leak first:** exploit a bug that *reads* memory (format string, out-of-bounds read, or the binary printing something) to recover the canary and/or a libc address — then compute the real addresses
  - **ret2libc / ret2plt:** with a leaked libc base, jump to `system("/bin/sh")`
- Practice on pwn.college modules covering leaks and canary bypasses, plus `ret2libc` style challenges.

### Step 5 — Heap exploitation (Month 19, weeks 3–4)
- **how2heap** ([github.com/shellphish/how2heap](https://github.com/shellphish/how2heap)) — executable C examples with comments. Build and run them under GDB, and *watch* the heap state change:
  - **Use-After-Free (UAF)** — using a freed pointer; the allocator reuses that chunk
  - **Double Free** — freeing twice; corrupts the allocator's free lists
  - **house of ...** — the classic techniques (house of spirit, house of force, tcache poisoning, unsorted-bin attack...)
- **Rule from Phase 1's Build-Before-Break Axiom applies perfectly here:** you already wrote a `malloc`/`free` (Phase 1 gate) — you know the free-list bookkeeping the attacker abuses. Re-read your own allocator before studying how2heap.

### Step 6 — The capstone: full chain vs. modern protections (Month 20)
- Pick a challenge (pwn.college's final modules, or a CTF pwn challenge from [ctftime.org](https://ctftime.org/) archives) that has **ALL protections on**: `checksec` shows NX enabled, PIE/ASLR on, canary found, full RELRO.
- Build the full chain:
  1. **Find the bug** (overflow / UAF / format string) — Phase 5 steps 1–2 skills
  2. **Leak** the canary + a libc address (ASLR bypass) — Step 4 skills
  3. **Craft the ROP chain** (`system("/bin/sh")` or an open-read-write chain) — Step 3 skills
  4. **Deliver** it reliably with pwntools, handling connection state — Phase 4 skills
- **Done when:** your script runs against the challenge *remotely* (a fresh process every run) and pops a shell.

---

## 🚪 THE GATE — Phase 5 Exit Test

> **You pass Phase 5 when all of these are true:**

- [ ] I exploited a binary with **ASLR + NX + Stack Canary all enabled** (verify with `checksec`)
- [ ] My exploit uses a **ROP chain** (not just injected shellcode) and **spawns `/bin/sh`**
- [ ] My exploit works **reliably** — I ran it 5+ times against fresh processes without failure
- [ ] I completed all 8 ROP Emporium challenges
- [ ] I can explain, out loud: what the canary protects, how I leaked it, how I beat ASLR, and why NX forces ROP
- [ ] I completed the pwn.college core modules (Program Interaction → Memory Errors/Format Strings, plus the shellcode path)
- [ ] I understand the how2heap examples for UAF and double-free (I could explain the free-list corruption to someone else)

**Passed?** → **You are a binary exploitation researcher.** Celebrate, then read [10-post-24-months.md](10-post-24-months.md). **Not yet?** → The most common missing piece is the leak: if your chain works with ASLR off but fails with it on, spend focused time on leak primitives.

---

## ⚠️ Common Mistakes (avoid these)

| Mistake | Why it's fatal | Fix |
|---|---|---|
| Turning off protections to make it "work" | The gate requires protections ON | `checksec` at the start; keep them all on |
| Copying ROP chains from writeups | You learn placement, not reasoning | Write your chains with pwntools from scratch |
| Ignoring the leak step | Without a leak, ASLR wins every time | Leak-first mentality: every exploit starts with "what can I read?" |
| Skipping heap (only doing stack) | Real-world exploits are mostly heap these days | how2heap, in order, under GDB |
| Using `cat flag` when the gate says `/bin/sh` | The gate is specific: spawn a shell | Do exactly the gate: ROP chain → `/bin/sh` |
| Not scripting with pwntools | Interactive-only exploitation doesn't scale | Learn pwntools early (ROP Emporium is perfect for it) |
| Breaking rules of platforms / posting writeups of pwn.college challenges | pwn.college asks you not to publish solutions — it's a free resource run by educators | Keep your writeups private (a local file is fine) |

---

## 🆘 Stuck? Do this

1. **Shellcode won't run?** NX is on — check. If NX is truly off, check alignment: `mov rsp` must be 16-byte aligned at the shellcode entry (`push`/`ret` alignment issues are the #1 silent shellcode killer). Use `add rsp, 8` before `ret` if needed.
2. **ROP chain crashing?** GDB it: set a breakpoint at your first gadget and `stepi` through the chain. The chain is wrong at the *first* wrong gadget — the crash tells you where.
3. **Canary always killing you?** You can't brute-force it (64-bit). You must **leak** it. Look for a format-string bug or an OOB read earlier in the program. If there's none... there's usually an off-by-one; search harder.
4. **Leak works locally, fails remotely?** Addresses differ per process (ASLR) — your leak must be per-run, and your ROP must use the *leaked* values. Rebuild the chain after each leak (pwntools makes this trivial).
5. **how2heap confusing?** Watch the video/walkthrough for that specific technique, then run the C example with breakpoints at each `free()`/`malloc()` and inspect the bins (`heap` command in pwndbg shows tcache/bins beautifully).
6. **Feeling overwhelmed?** Normal at month 17–18. The "stuck procedure" in `docs/12-getting-unstuck.md` and the pwn.college Discord (`https://discord.gg/pwncollege`) exist for exactly this.

---

## 🔗 Bridge to Post-24-Months

You've passed all five gates. You are no longer a tool-operator — you are a **researcher**: you can read machine code, understand kernels, speak protocols, and break modern mitigations. Now the synthetic puzzles give way to multi-million-line real-world codebases: fuzzing, symbolic execution, kernel/browser/hardware tracks, bounties, and Pwn2Own.

→ **[10-post-24-months.md](10-post-24-months.md)**
