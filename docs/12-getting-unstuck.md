# 12 · Getting Unstuck — You Will Never Be Stuck Alone Again

> This file exists for one reason: **the #1 reason people quit is feeling stuck.** Here is the complete procedure for every kind of "stuck."

---

## 🧠 The Universal Unstick Procedure (do this FIRST, in this order)

When you're stuck on anything — a concept, a lab, an exploit, a crash:

1. **State the problem in one sentence, out loud.** "My malloc corrupts memory after freeing 5 blocks." If you can't state it, you haven't isolated it yet.
2. **Reduce the scope.** Make the failing case as small as possible. Delete code until the bug disappears; then re-add until it returns. A minimal reproducer is 80% of the fix.
3. **Get evidence.** Guess nothing. Run it in GDB / strace / Wireshark and *look* at what actually happens. The debugger is your teacher.
4. **Change ONE variable.** Never try two fixes at once — you won't learn which one worked.
5. **Wait 2 days max.** If still stuck after 2 days of genuine attempts, use the phase-specific fixes below, then ask a human (communities listed at the bottom).
6. **Sleep on it.** Seriously. Staring harder has diminishing returns; your brain solves problems during sleep. A fresh morning often solves the "unsolvable" bug in 10 minutes.

**Golden rule: feeling stupid is not a bug in you. It's the standard experience of learning this craft. Every researcher you admire has been stuck on something dumber than what you're stuck on.**

---

## 🔍 Stuck by Phase

### Phase 1 (C & memory)
| Symptom | Fix |
|---|---|
| Segfault | GDB: `gdb ./prog`, `run`, `bt`, `info locals`. The crash line + backtrace tells you the story |
| Pointer confusion | Draw the memory diagram on paper (addresses left, values right). Or watch a 10-min LiveOverflow primer, then re-draw |
| malloc lab heap corruption | Print your free-list state after every `malloc`/`free`. Find the *first* divergence, not the crash |
| Can't get Data Lab puzzle | Solve a simpler case first (works for 50% of inputs), then extend. Never solve the whole puzzle at once |

### Phase 2 (Assembly & RE)
| Symptom | Fix |
|---|---|
| Can't find `main` in Ghidra | Non-stripped: `entry` → `__libc_start_main(main)`. Stripped: look for the function with the most callers/references |
| Crackme too hard | Drop difficulty to 1.x–2.x, or read only the *first hint* of the writeup (after 2 days). One hint is allowed; the whole writeup is cheating yourself |
| Slow assembly reading | Speed comes from volume — do 3 small Godbolt experiments daily for 60 days |
| Bomb Lab phase stuck | Trace the phase by hand with a small input; watch a video primer on that pattern (recursion, linked lists, etc.) |

### Phase 3 (OS & kernel)
| Symptom | Fix |
|---|---|
| xv6 won't build/boot | Install the RISC-V cross-compiler (`riscv64-linux-gnu-gcc`) and `qemu-system-misc` per the course setup page |
| Syscall returns -1 | Check syscall number vs table index, handler signature `uint64 (*)(void)`, and that the syscall is reachable from user space |
| Page table bugs | Draw the 3-level walk on paper. Check PTE flags (`PTE_V`, `PTE_U`, `PTE_RW`) — most bugs are one flag |
| Trap path confusion | Watch the course video / LiveOverflow on the xv6 trap path, then single-step it in GDB under QEMU |

### Phase 4 (Networking & parsers)
| Symptom | Fix |
|---|---|
| `recv()` gets partial data | TCP is a stream. Loop until you have the bytes you need. Never assume one `recv()` = one message |
| Raw socket permission denied | Needs root (`sudo`) or `CAP_NET_RAW`. On WSL2, use a VM if raw sockets misbehave |
| Parser reading wrong bytes | Hex-dump the packet and line up your struct offsets byte-by-byte. Check padding (`#pragma pack`) and endianness |
| Server hangs | Watch the actual bytes: `tcpdump -A` or Wireshark while `curl -v` connects. See where the conversation stops |

### Phase 5 (Exploitation)
| Symptom | Fix |
|---|---|
| Shellcode won't run | Check NX is off for that test; check stack alignment (`add rsp, 8` before `ret` when needed) |
| ROP chain crashes | GDB it: breakpoint at the first gadget, `stepi` through. The first wrong gadget is where the crash tells the truth |
| Canary kills you | You cannot brute-force it — you must *leak* it (format string / OOB read). Find the read bug first |
| Works locally, fails remotely | ASLR differs per process. Your leak must happen per-run and your chain must use leaked values — rebuild after each leak |
| how2heap confusing | Watch that technique's walkthrough, then run the C example with breakpoints at each `free()`/`malloc()` and inspect the bins |

---

## 🆘 Stuck on the "Meta" Level

### "I feel like I know nothing / impostor syndrome"
- **Normal.** The Dunning-Kruger curve means beginners feel confident; real competence *feels* like "I know nothing" because you finally see the depth.
- **Proof you're progressing:** you can now *explain* what you don't know. That's a different person from month 1.
- **Fix:** open `PROGRESS.md`, tick a small box, and read the last 30 days of your own progress. You're comparing yourself to the *finished* version of experts; compare with your past self instead.

### "I'm in tutorial hell"
- You watch/read but don't *do*. **Fix:** every video/book chapter = one artifact you build or break afterward. No artifact, no learning. Minimum: 50% of your time is hands-on, always.

### "I don't know what to do today"
- **Fix:** the answer is always in `PROGRESS.md`. Open the current phase, do the next unchecked step. If everything's checked, do the gate — or extra reps of the current skill.

### "I keep jumping between resources"
- **Fix:** resources are chosen *for you* in each phase doc. Follow the phase doc's order. The vault ([03-resources.md](03-resources.md)) is a reference, not a to-do list.

### "I'm bored / losing motivation"
- **Fix:** do the fun 10 minutes — a Microcorruption level, a crackme, a pwn challenge. Motivation follows momentum, not the reverse. And keep the rest day sacred.

### "Should I buy a course / tool / VPS?"
- **Fix:** no. Everything in this framework is free and verified. If you're buying, you're bypassing a gap you could close by *doing*.

---

## 💬 Where to Ask Humans (free, active communities)

| Where | Link | Best for |
|---|---|---|
| **pwn.college Discord** | [https://discord.gg/pwncollege](https://discord.gg/pwncollege) | pwn.college challenges — the staff/community are famously helpful (hints, not answers) |
| **RE4B Discord** | [https://discord.gg/UNsu88RYuN](https://discord.gg/UNsu88RYuN) | Reverse engineering questions |
| **Crackmes.one Discord** | [https://discord.gg/2pPV3yq](https://discord.gg/2pPV3yq) | Cracking practice, RE community |
| **r/ExploitDev** | [https://www.reddit.com/r/ExploitDev/](https://www.reddit.com/r/ExploitDev/) | Exploit dev help |
| **r/ReverseEngineering** | [https://www.reddit.com/r/ReverseEngineering/](https://www.reddit.com/r/ReverseEngineering/) | RE discussion |
| **Stack Overflow** | [https://stackoverflow.com/](https://stackoverflow.com/) | Specific technical questions (C, gdb, sockets) — include code + error messages |

### How to ask (so you get answers)
1. Show what you **tried** and what **evidence** you got (error output, GDB backtrace, hex dump).
2. State the **goal** and the **exact failing case** (minimal reproducer).
3. Say what you **already ruled out**.
4. Never ask "how do I solve this?" — ask "here's my attempt; here's where it diverges; what am I misunderstanding?"

---

## 📏 Signs You're Actually Progressing (even when it feels slow)

- You can now explain last month's "impossible" concept to a beginner
- You fixed a bug without help that took you 3 days last month
- You read assembly faster than you did 30 days ago
- You predict a crash before it happens ("that `free()` is wrong" → it is)
- You look at a system and your first thought is "where's the parser?"
- Your `PROGRESS.md` has new ticks this week

**If any of these are true, you are not stuck — you're climbing.**

---

**Back to the map:** [`README.md`](../README.md) · **Your tracker:** [`PROGRESS.md`](../PROGRESS.md)
