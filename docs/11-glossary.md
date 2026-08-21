# 11 · Glossary — Plain-English Definitions

> Every technical term used in this repo, defined without jargon. Skim it once; come back whenever a word stops you in your tracks.

---

## Memory & Architecture

| Term | Plain-English meaning |
|---|---|
| **Von Neumann architecture** | The design where one memory holds *both* program instructions and data; the CPU fetches an instruction, then executes it |
| **Register** | A tiny, ultra-fast storage slot *inside* the CPU (e.g., `RAX`, `RSP`). The CPU can only do arithmetic on registers |
| **RIP / EIP / IP** | The **instruction pointer** — the address of the *next instruction* the CPU will execute |
| **RSP / ESP / SP** | The **stack pointer** — points to the top of the call stack |
| **RBP / EBP / BP** | The **base/frame pointer** — marks the start of the current function's stack frame |
| **RAX / EAX / AX** | The **accumulator** — the default return-value register (function results land here) |
| **Stack** | Function-scoped memory, allocated/freed automatically on call/return. Grows downward. Where local variables and return addresses live |
| **Heap** | Long-lived dynamic memory, managed manually with `malloc()`/`free()`. Grows upward |
| **Pointer** | A variable whose value is a *memory address* (a "reference" to another location) |
| **Pointer arithmetic** | Adding to a pointer moves by *element size*, not bytes: `ptr + 1` = next element |
| **Paging / Page tables** | Memory organized in 4 KB pages; the CPU translates virtual addresses → physical addresses through page tables (this is what makes each process think it owns all memory) |
| **Alignment** | The rule that multi-byte values should sit at addresses divisible by their size (2, 4, 8...); misaligned access costs performance or crashes |
| **Stack frame** | The region of the stack a function owns (its locals + saved registers + return address) |
| **Return address** | The address the CPU jumps back to when a function returns — the #1 corruption target in exploitation |
| **Little/big endian** | The order bytes of a multi-byte number are stored: least-significant first (little) or last (big). x86 is little-endian |
| **Rowhammer** | A *physics* bug: repeatedly accessing DRAM rows flips bits in adjacent rows — a software-triggered hardware failure |

## Assembly & Reverse Engineering

| Term | Plain-English meaning |
|---|---|
| **Assembly** | The human-readable form of machine code (`mov rax, rbx`); one instruction ≈ one CPU operation |
| **Machine code** | The actual bytes the CPU executes |
| **Disassembly** | Converting machine-code bytes back into assembly |
| **Decompiler** | A tool (e.g., Ghidra) that converts assembly into C-like pseudocode — a hint, not ground truth |
| **Gadget** | A tiny sequence of instructions already inside a binary that ends in `ret` — the building block of ROP chains |
| **Calling convention** | The ABI rule for passing function arguments in registers (`RDI, RSI, RDX, RCX, R8, R9` on x86_64) |
| **Prologue / epilogue** | The standard entry/exit instructions of a function (saving frame, setting up stack; tearing it down, returning) |
| **Stripped binary** | A binary with its symbol table (function names, debug info) removed — harder to reverse |
| **Crackme** | A deliberately vulnerable small program you're meant to "crack" (find the password/key) for practice |

## Operating Systems & Kernel

| Term | Plain-English meaning |
|---|---|
| **System call (`syscall`)** | The *only* official way user programs ask the kernel for anything (open file, spawn process, send packet) |
| **Ring 0 / Kernel mode** | Highest CPU privilege — can touch hardware and all memory |
| **Ring 3 / User mode** | Lowest privilege — where normal programs run, restricted by the CPU itself |
| **Kernel** | The core OS program running in Ring 0 that manages processes, memory, devices |
| **Process isolation** | Each process gets its own virtual address space; processes can't see each other's memory |
| **SID / DACL (Windows)** / **UID / GID (Linux)** | Identity and permission systems that decide who may access what |
| **Trap / Interrupt** | The mechanism that switches CPU control to the kernel (used by syscalls, timers, hardware events) |
| **Trap frame** | The saved register state of the user program while the kernel handles a trap |
| **Page table walk** | The CPU's multi-level translation of virtual→physical addresses (L0/L1/L2 on RISC-V) |
| **xv6** | MIT's small teaching Unix-like kernel, written in C, used throughout Phase 3 |
| **QEMU** | Free machine emulator — runs xv6 (and other OSes) on your computer |

## Networking & Parsing

| Term | Plain-English meaning |
|---|---|
| **TCP/IP stack** | The layered set of protocols moving data across networks (Ethernet → IP → TCP → application) |
| **Segment / Packet / Frame** | The protocol data unit at each layer (TCP / IP / Ethernet) |
| **Handshake** | TCP's SYN → SYN-ACK → ACK exchange that opens a connection |
| **TCP state machine** | The formal set of connection states (LISTEN, ESTABLISHED, CLOSE-WAIT, TIME-WAIT...) and legal transitions |
| **Raw socket** | A socket that lets you build/send/parse packets yourself instead of letting the OS do it |
| **RFC** | "Request For Comments" — the official written specification of internet protocols (e.g., RFC 9293 = TCP) |
| **Parser** | Any code that reads input and decides what it means. **In this framework: the most security-relevant part of any system** |
| **LangSec** | The security discipline: "every security bug is a parser bug" — data is interpreted beyond what the system assumes |
| **Injection** | Smuggling *instructions* into a field the parser assumed was *data* (SQL injection, command injection) |
| **Deserialization** | Reconstructing objects from serialized data — notoriously dangerous when the data is untrusted |
| **State-machine flaw** | When a system can be pushed into an illegal/assumed-impossible state and misbehaves |
| **Sniffer** | A program that captures and dissects packets on a network interface |

## Exploitation & Protections

| Term | Plain-English meaning |
|---|---|
| **Buffer overflow** | Writing more data than a buffer can hold, corrupting whatever sits after it in memory |
| **Stack corruption** | An overflow that overwrites the saved return address / frame state on the stack |
| **Shellcode** | Machine-code bytes designed to run after a successful exploit (traditionally: spawn `/bin/sh`) |
| **ROP (Return-Oriented Programming)** | Chaining existing "gadgets" (each ending in `ret`) so the program executes attacker-chosen logic from its *own* code — works even when the stack is non-executable |
| **ret2libc / ret2plt** | Redirecting execution into `libc` functions like `system()` — the classic NX bypass |
| **Use-After-Free (UAF)** | Using a pointer after its memory was freed; the allocator may have reused the chunk for something else |
| **Double free** | Calling `free()` twice on the same pointer — corrupts the allocator's free lists |
| **House of... (spirit/force/water...)** | Named glibc heap techniques that turn allocator bookkeeping into arbitrary writes |
| **ASLR** | Address Space Layout Randomization — randomizes where code/data live each run, so you don't know addresses in advance |
| **NX / DEP** | Non-Executable stack — the CPU refuses to execute instructions from data pages (stack/heap) |
| **Stack canary** | A random value placed before the saved return address; if overwritten, the program detects it and aborts |
| **PIE** | Position-Independent Executable — the *program's own* code is also randomized (extends ASLR to the binary) |
| **RELRO** | Protection for the GOT (global offset table) — full RELRO makes it read-only after load, blocking GOT overwrites |
| **Leak primitive** | A bug that *reads* memory back to you (format string, OOB read) — the standard way to beat ASLR and canaries |
| **checksec** | A tool that tells you which protections a binary has (pwntools ships it) |
| **pwntools** | The standard Python library for scripting exploit development |

## Research & Industry

| Term | Plain-English meaning |
|---|---|
| **CTF** | Capture The Flag — a hacking competition with challenges (pwn, RE, web, crypto...). CTFtime indexes them globally |
| **Wargame** | A persistent, non-timed hacking practice platform (vs. a 48-hour CTF) |
| **Fuzzing** | Automatically feeding a program mutated inputs to find crashes. "Coverage-guided" keeps inputs that explore new code paths |
| **Symbolic execution** | Reasoning about code mathematically: computing what inputs reach a target line (angr, Z3) |
| **DBI (Dynamic Binary Instrumentation)** | Injecting runtime tracing/hooks into a running binary (Frida, DynamoRIO) |
| **JIT compiler** | Just-In-Time compiler — translates code to machine code at runtime (browsers' JS engines are JITs; a huge attack surface) |
| **Baseband** | The radio processor in phones — the modem that talks to cellular networks; a major research target |
| **Side-channel attack** | Extracting secrets from *physical* measurements: timing, power, electromagnetic emissions |
| **Fault injection** | Physically disturbing a chip (voltage/clock glitches, lasers) to make it misbehave |
| **CVE** | Common Vulnerabilities and Exposures — the public ID given to a discovered vulnerability |
| **Zero-day** | A vulnerability unknown to the vendor (no patch exists — "day zero" of awareness) |
| **Bug bounty** | A vendor's authorized program paying researchers for reported vulnerabilities |
| **Pwn2Own** | The live, in-person zero-day exploitation competition with large cash prizes |
| **Red team** | An authorized team that attacks an organization to test its defenses |
| **Sandbox escape** | Breaking out of a restricted execution environment into the host |
| **Trust boundary** | The line where untrusted data/input meets trusted code — where vulnerabilities live |

---

**Feeling stuck on a concept?** → [`12-getting-unstuck.md`](12-getting-unstuck.md) · **Back to the map:** [`README.md`](../README.md)
