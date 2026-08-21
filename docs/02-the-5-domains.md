# 02 · The 5 Non-Negotiable Technical Domains

> **Reading time: ~10 minutes. This is the knowledge skeleton of the whole framework. Every phase in this repo maps to exactly one of these domains.**

To be a **hacker** rather than a **tool-operator**, you must master the fundamental primitives of computation. Tools change every year; these five domains have been stable for 50 years and will be stable for the next 50. Master the primitives, and every new tool is just a convenience.

---

## The Five Domains

| # | Domain | What it is, in one sentence | Covered in phase |
|---|---|---|---|
| 1 | **Computer Architecture & Low-Level Memory** | How a CPU actually executes programs and how memory actually works | [Phase 1](05-phase-1.md) |
| 2 | **Assembly Language & Reverse Engineering** | Reading machine code like a language, with no source code | [Phase 2](06-phase-2.md) |
| 3 | **Operating System Internals & Kernel Boundaries** | Where user code ends and the kernel begins — and what crosses that line | [Phase 3](07-phase-3.md) |
| 4 | **Wire-Level Networking & Parser Theory (LangSec)** | What bytes actually travel across a network, and where parsing breaks | [Phase 4](08-phase-4.md) |
| 5 | **Vulnerability Research & Binary Exploitation** | Turning the flaws from domains 1–4 into working exploits | [Phase 5](09-phase-5.md) |

---

## Domain 1 · Computer Architecture & Low-Level Memory

**The question it answers:** *What is actually happening inside the machine when my code runs?*

Core concepts you will master:

- The **Von Neumann architecture** — one shared memory holding both instructions and data; the CPU fetches, decodes, executes
- **CPU registers** — the CPU's working memory: `RIP` (next instruction pointer), `RSP` (stack pointer), `RBP` (base/frame pointer), `RAX` (accumulator / return value), and the rest of the general-purpose register set
- **Stack vs. Heap** — stack: fast, automatic, function-scoped memory; heap: dynamic, manual, `malloc()`/`free()` territory
- **Pointer arithmetic** — a pointer is just a number that happens to be a memory address; `ptr + 1` means "next element", not "one byte"
- **Memory paging** — memory is organized in 4 KB pages; the CPU translates virtual addresses to physical ones through page tables
- **Alignment** — CPUs read memory in aligned chunks; misalignment costs performance or crashes

**Why a hacker must know this:** every memory-corruption exploit in existence (buffer overflow, use-after-free, ROP) is a manipulation of these structures. You cannot exploit what you cannot see.

---

## Domain 2 · Assembly Language & Reverse Engineering

**The question it answers:** *What does a program actually do, when I only have the compiled binary?*

Core concepts you will master:

- Reading raw machine code for **x86_64** and **ARM** (the two architectures that run the world)
- **Disassembly** — turning bytes back into readable instructions
- **Dynamic debugging** with GDB / Ghidra — stepping through a binary instruction-by-instruction, watching registers and memory change
- **Reconstructing developer mental models** from compiled binaries — recognizing patterns like "this is a loop", "this is a string comparison", "this is an if/else" in assembly

**Why a hacker must know this:** vulnerabilities live in binaries, not source code. Every serious target — closed-source software, firmware, malware — reveals itself only to someone who can read machine code. Also: understanding exactly what the compiler *does* with your C code is the single fastest way to truly understand C.

---

## Domain 3 · Operating System Internals & Kernel Boundaries

**The question it answers:** *What is the trust boundary between my program and the machine?*

Core concepts you will master:

- **User Mode (Ring 3)** vs. **Kernel Mode (Ring 0)** — the hardware-enforced privilege boundary
- **System calls (`syscall`)** — the *only* legitimate way user code asks the kernel for anything (open files, spawn processes, send packets)
- **Process isolation** — each process gets its own virtual address space; they cannot see each other's memory
- **Permissions** — Windows SIDs/DACLs, Linux UIDs/GIDs, and how access control is actually enforced
- **Kernel memory structures** — page tables, process control blocks, file descriptors, and what happens when a user-space bug can corrupt them

**Why a hacker must know this:** the kernel is the ultimate prize. User-space exploits are often just the first step; privilege escalation, sandbox escapes, and rootkits are all kernel-boundary stories. If you understand the boundary, you understand every escalation path.

---

## Domain 4 · Wire-Level Networking & Parser Theory (LangSec)

**The question it answers:** *What bytes cross the wire, and how do programs decide what those bytes mean?*

Core concepts you will master:

- The **TCP/IP stack** — from Ethernet frames to IP packets to TCP segments to application data
- **State transitions** — TCP's state machine (LISTEN → SYN-SENT → ESTABLISHED → ...), and what happens when a system is forced into an unexpected state
- **RFC protocol specifications** — the actual written rules of the protocols (e.g., RFC 9293 for TCP)
- **Raw packet crafting** — building packets byte-by-byte instead of using libraries
- **Parser theory / LangSec** — the deep truth: *every* security problem is a parsing problem. Find where a program interprets input (a parser), find the gap between what the parser allows and what the rest of the system assumes, and you've found the vulnerability

**Why a hacker must know this:** the classic flaw is **confusing instructions with data** — injection (SQL, command, LDAP), deserialization attacks, and state-machine flaws all come from parsers that accept more than they should. A huge share of all real-world exploits live exactly here. This domain is the most underrated in security education, and this framework gives it a full phase.

---

## Domain 5 · Vulnerability Research & Binary Exploitation

**The question it answers:** *How do I turn a flaw into a working, reliable exploit — even against modern protections?*

Core concepts you will master:

- **Buffer overflows** — writing past the end of a buffer to corrupt adjacent memory
- **Stack corruption** — overwriting saved return addresses / frame state on the stack
- **Return-Oriented Programming (ROP)** — when you can't inject code (NX/DEP), reuse the program's *own* instructions ("gadgets") by chaining return addresses
- **Glibc heap exploitation** — use-after-free, double-free, and the family of "house of..." techniques that turn heap bookkeeping flaws into arbitrary writes
- **Bypassing OS protections** — ASLR (address space layout randomization), NX/DEP (non-executable memory), Stack Canaries, and control-flow integrity

**Why a hacker must know this:** this is where domains 1–4 become weapons. Modern systems are protected by default, so a real exploit is a *chain*: a bug + a way to leak addresses + a ROP payload + a way to survive the mitigations. Building that chain end-to-end is the capstone skill of the framework.

---

## The Golden Thread

These five domains are **not independent subjects** — they are one story told five times:

```
Domain 1: how memory works
    └─► Domain 2: how to read what a program does with memory
            └─► Domain 3: how the OS polices that memory (and where it can't)
                    └─► Domain 4: how bytes arrive and get interpreted
                            └─► Domain 5: how to abuse all of the above
```

If you ever feel like a concept is "too much", re-read this page: **every later concept is just a new angle on memory, machine code, privilege, and parsing.** The phases exist to build exactly these four layers, in the only order that works.

**Next:** [`03-resources.md`](03-resources.md) — the master vault of 100% free, verified resources, each one with a "what it teaches" and "when to use it".
