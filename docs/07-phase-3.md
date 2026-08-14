# 07 · PHASE 3 — Operating System Internals & Kernel Boundaries

> **Months 9–12 · Understand the trust boundary between your code and the machine. Then modify the kernel.**
> **GATE: Add a new custom system call to the xv6 kernel (in C) and manage virtual-memory page tables.**

---

## 🎯 What you'll be able to do by the end of this phase

- Explain what a system call is, how it works end-to-end (user code → `syscall` instruction → kernel handler → return), and look up any syscall's number/registers instantly
- Explain Ring 0 vs Ring 3, why the CPU enforces it, and what "kernel mode" actually buys
- Run a real teaching kernel (**xv6**, MIT's Unix-like OS) and modify it
- Add a brand-new system call to the kernel, exposed to user programs
- Implement virtual-memory page-table operations (the xv6 `pgtbl` lab)
- Read kernel C code and understand the core structures: page tables, trap frames, file descriptors, process table

---

## 📋 Prerequisites

- **PASSED the Phase 2 gate** (you cracked a mystery binary without source).
- Solid C. Assembly reading ability (you'll read kernel assembly trampolines).
- Comfort in a terminal. GDB.

---

## ⏱️ Duration

- **~4 months** at 3.5h/day, 6 days/week.
- Months 9–10: concepts + get xv6 running. Months 11–12: the labs that matter for the gate.

---

## 👣 The Steps (do them in this exact order)

### Step 1 — Syscalls: the single most important OS concept (Month 9, weeks 1–2)
- Read the [Linux System Call Table for x86_64](https://blog.rchapman.org/posts/Linux_System_Call_Table_for_x86_64/) (pin this tab forever).
- Learn the mechanics: user code puts the syscall number in `RAX`, args in `RDI/RSI/RDX/R10/R8/R9`, executes `syscall`, the CPU switches to kernel mode, dispatches, returns.
- **Do it by hand:** write a tiny C (or assembly!) program that calls `syscall(SYS_write, 1, "hi\n", 3)` — no libc wrapper, direct `syscall`.
- Watch your own program's syscalls live: `strace ./your_program` — every file open, every write, every exit. `strace` is your window into the kernel boundary.

### Step 2 — Ring 0 vs Ring 3, process isolation, permissions (Month 9, weeks 3–4)
- Read the [xv6 book](https://mit-pdos.github.io/xv6-riscv-book/) chapters: **Operating System Interfaces** and **Page Tables** (the book is free and short — read it like a real book, it pays off).
- Concepts to be able to explain out loud:
  - User mode (Ring 3) vs kernel mode (Ring 0) — what the CPU enforces
  - Process isolation — each process has its own virtual address space; why one process can't read another's memory
  - Permissions: Linux UIDs/GIDs (and know that Windows has the same idea with SIDs/DACLs)
  - What happens on a syscall and on an interrupt/trap (the "trap frame" dance)

### Step 3 — Get xv6 running (Month 10, week 1)
- Course home: [https://pdos.csail.mit.edu/6.828/](https://pdos.csail.mit.edu/6.828/) — auto-redirects to the current offering (the course is now numbered **6.1810**; it was 6.828 → 6.S081 → 6.1810 — same xv6 course, renamed over the years).
- Source: [https://github.com/mit-pdos/xv6-riscv](https://github.com/mit-pdos/xv6-riscv).
- Follow the course's setup instructions to build and boot xv6 under QEMU (free emulator).
- **Done when:** `make qemu` boots a working shell *inside* xv6.

### Step 4 — The core labs, in order (Months 10–12)
The official labs are at `https://pdos.csail.mit.edu/6.828/<year>/labs/<lab>.html` (e.g. the current year's page). The order that matters:

| Lab | What you do | Why it matters |
|---|---|---|
| **util** (Unix utilities) | Reimplement `sleep`, `pingpong`, `primes` as xv6 user programs | Learn the xv6 environment + syscalls from the user side |
| **syscall** (System calls) | Add `trace` and `sysinfo` syscalls: modify the kernel, add handlers, expose to users | **THE core gate skill** — you add syscalls to the kernel |
| **pgtbl** (Page tables) | Map a page into user address space; implement a kernel page-table walk with `vmprint` | **THE core gate skill** — you manage virtual memory page tables |
| **traps** | Handle backtrace and alarms: trap frames, timer interrupts | Deep understanding of the trap path |
| **cow** (Copy-on-write fork) | Implement COW fork using page-table tricks + page faults | Real kernel engineering — the kind used by actual OSes |
| **net, lock, fs, mmap** (stretch) | Network driver, parallel speedups, file system, mmap | Optional stretch labs — do as many as you can |

### Step 5 — Your own custom syscall, from scratch (Gate prep, Month 12)
- Invent a syscall the kernel doesn't have (e.g., `sys_getppid_count` that returns how many times a process called `getpid`, or `sys_settickrate`).
- Implement it end-to-end: syscall number in `syscall.h`/`syscall.c` table → kernel function → user-space header → call it from a test program.
- For the page-table half of the gate, complete the `pgtbl` lab requirements: `vmprint` (walk and print the page table) and the `mappage` functionality — then explain each level (L0/L1/L2) out loud.

---

## 🚪 THE GATE — Phase 3 Exit Test

> **You pass Phase 3 when all of these are true:**

- [ ] I added a **new custom system call** to xv6 (number, handler, table entry, user-facing function) and a user program successfully calls it
- [ ] I implemented the **page-table lab** requirements (`vmprint` walking and printing a 3-level page table; mapping a page) and it passes the official tests
- [ ] I can explain, out loud: what happens from `syscall(SYS_write,...)` in a C program to bytes appearing on the terminal
- [ ] I can explain Ring 0 vs Ring 3, and what would happen if a user program could corrupt a page table
- [ ] I used `strace` to observe real programs' syscalls and understood every line

**Passed?** → [Phase 4](08-phase-4.md). **Not yet?** → Revisit the specific lab. If `syscall` lab took you 3 weeks, that's normal; it's the single most educational lab in the course.

---

## ⚠️ Common Mistakes (avoid these)

| Mistake | Why it's fatal | Fix |
|---|---|---|
| Reading about xv6 but never booting it | OS skills are 90% hands-on | `make qemu` in week 1 of month 10. No exceptions |
| Copying lab solutions | The gate demands *your* kernel knowledge; also MIT checks | Write it yourself; use the course discussions only for hints |
| Skipping the syscall table / ABI details | You'll need syscall-level thinking in Phases 4–5 | Do Step 1 by hand (direct `syscall()` without libc) |
| Ignoring page tables as "too hard" | Page tables are the #1 privilege-escalation battleground | The pgtbl lab IS the gate. Slow down, do it fully |
| Not reading the xv6 book | The labs reference it constantly | Read each chapter *before* its lab |
| Rushing to "real" kernel hacking (e.g. writing kernel exploits) | You need the fundamentals first | Finish the labs. Real kernel pwn comes post-24-months (Track A) |

---

## 🆘 Stuck? Do this

1. **xv6 won't build/boot?** Check the course page for the exact toolchain (`riscv64-linux-gnu-gcc`, QEMU). Common fix: install the RISC-V cross-compiler and `qemu-system-misc`.
2. **Syscall lab broken?** `syscall` returns `-1`? Check: the number in `syscall.h` matches the table index in `syscall.c`; the handler signature matches `uint64 (*)(void)`. Print-debug from inside the kernel — `printf` works there.
3. **Page-table lab segfaulting?** Draw the 3-level walk on paper: VPN[2] → VPN[1] → VPN[0] → PTE flags. Verify each level's entry with `vmprint` output. 90% of mistakes are one wrong flag bit (e.g., forgetting `PTE_V` or `PTE_U`).
4. **Concept fog ("I don't get the trap path")?** Watch a LiveOverflow or course video on the xv6 trap path, then single-step the trap in GDB (QEMU + gdb-multiarch works). Seeing it happen once beats reading about it 10 times.
5. **Time pressure?** The `net`, `lock`, `fs`, `mmap` labs are optional for the gate. If you must choose, spend the time making `syscall` and `pgtbl` perfect.

---

## 🔗 Bridge to Phase 4

You now know how programs ask the OS for things, and how the kernel polices memory and privilege. **Phase 4 leaves the single machine** and follows the bytes that travel *between* machines: raw sockets, protocol state machines, and the parsers that interpret untrusted input — where a huge fraction of real-world vulnerabilities live.

→ **[08-phase-4.md](08-phase-4.md)**
