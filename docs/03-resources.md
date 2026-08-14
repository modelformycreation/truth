# 03 · The Master Resource Vault (100% Free · All Verified)

> **Every link in this file is 100% free, publicly accessible, and requires no paid subscription or university login.**
> All links were **verified live on 2026-08-14**. If any link ever breaks, use the Internet Archive: `https://web.archive.org/web/*/<url>`.

**How to read this vault:** each resource has a *What it teaches* and *When to use it*. Use this file as a reference — the phase documents tell you *which* resources to open and *in what order*. Don't try to consume everything at once. The vault is a map, not a to-do list.

---

## 🛠️ Part A · Set Up Your Free Toolchain First (one-time, ~1 hour)

You need a Linux environment. Pick **one**:

| Tool | Link | Notes |
|---|---|---|
| **Ubuntu on WSL2** (if you use Windows) | [https://learn.microsoft.com/windows/wsl/install](https://learn.microsoft.com/windows/wsl/install) | Official Microsoft guide, free, 10 minutes |
| **VirtualBox + Ubuntu VM** (if you use Windows/macOS) | [https://www.virtualbox.org/](https://www.virtualbox.org/) · [https://ubuntu.com/download](https://ubuntu.com/download) | Free VM software + free OS image |
| **pwn.college in-browser Linux** (zero install, works anywhere) | [https://pwn.college/](https://pwn.college/) | Free browser terminals via GitHub login — great for Phases 1–5 practice |

Then install the standard free toolchain (on Debian/Ubuntu, run once):

```bash
sudo apt update && sudo apt install -y build-essential gdb python3 python3-pip net-tools tcpdump
pip install pwntools
```

| Tool | What it is | Free from |
|---|---|---|
| `gcc` / `clang` | C compilers (you will read their assembly constantly) | Included in `build-essential` |
| `gdb` | The GNU debugger — single-step programs, watch registers/memory | Included above |
| **Ghidra** | NSA's free reverse-engineering suite (disassembler + decompiler) | [https://ghidra-sre.org/](https://ghidra-sre.org/) |
| **pwntools** | Python library for building exploits | `pip install pwntools` |
| **Wireshark** | Packet capture & analysis | [https://www.wireshark.org/](https://www.wireshark.org/) |

> **Do not** buy courses, VPS servers, or "hacking tools". Everything this framework needs is free, including the practice targets.

---

## 📚 Part B · Resources by Domain

### Domain 1 · Computer Architecture & Silicon Basics (used in Phase 1)

| Resource | Link | What it teaches | When to use it |
|---|---|---|---|
| **CMU CS:APP Self-Study Labs** | [http://csapp.cs.cmu.edu/3e/labs.html](http://csapp.cs.cmu.edu/3e/labs.html) | Data Lab (bit-level thinking), Bomb Lab (debugging/disassembly), Attack Lab (first exploit!), Malloc Lab (write your own allocator). The self-study handouts are downloadable **without** an account | Phase 1 (Data Lab → Malloc Lab), Phase 2 (Bomb Lab), Phase 5 (Attack Lab) |
| **Nand2Tetris** | [https://www.nand2tetris.org/](https://www.nand2tetris.org/) | Build a simulated computer from NAND gates up to an OS. All lectures, projects and tools free | Phase 1, if you want true first-principles understanding of how a CPU works |
| **x86-64 Assembly cheat sheets** | [https://cs.brown.edu/courses/cs033/docs/guides/x64_cheatsheet.pdf](https://cs.brown.edu/courses/cs033/docs/guides/x64_cheatsheet.pdf) | One-page reference for registers, instructions, calling conventions | Keep pinned in a browser tab from Phase 1 onward |

### Domain 2 · Reverse Engineering & Assembly (used in Phase 2)

| Resource | Link | What it teaches | When to use it |
|---|---|---|---|
| **RE4B — Reverse Engineering for Beginners** | [https://beginners.re/](https://beginners.re/) | Free PDF book (multi-language) mapping C constructs directly to x86, x64, and ARM assembly. The classic free RE text | Phase 2, read chapters in order |
| **Azeria Labs** | [https://azeria-labs.com/](https://azeria-labs.com/) | The premier free site for ARM assembly and ARM exploitation | Phase 2 (ARM track) and Track C later |
| **Crackmes.one** | [https://crackmes.one/](https://crackmes.one/) | Public archive of 4,000+ compiled binaries to crack with no source code. Sort by difficulty; downloads are password-protected (password: `crackmes.one`) | Phase 2, daily practice |
| **Microcorruption** | [https://microcorruption.com/](https://microcorruption.com/) | Browser-based MSP430 assembly lock-hacking game with a built-in debugger. Zero installation | Phase 2, levels 1–10 |
| **Ghidra** | [https://ghidra-sre.org/](https://ghidra-sre.org/) | NSA's free RE suite — disassembly + decompilation | Phase 2 onward |

### Domain 3 · Operating System Internals (used in Phase 3)

| Resource | Link | What it teaches | When to use it |
|---|---|---|---|
| **MIT 6.S081 / 6.1810 — xv6 OS Engineering** (formerly 6.828) | [https://pdos.csail.mit.edu/6.828/](https://pdos.csail.mit.edu/6.828/) | MIT's open course: modify a real Unix-like kernel (xv6) written in C. Free lecture notes, homework, and labs. The URL auto-redirects to the current year's page | Phase 3 |
| **xv6 book (current version)** | [https://mit-pdos.github.io/xv6-riscv-book/](https://mit-pdos.github.io/xv6-riscv-book/) | The official book that explains every line of the xv6 kernel | Phase 3 |
| **xv6 source code** | [https://github.com/mit-pdos/xv6-riscv](https://github.com/mit-pdos/xv6-riscv) | The kernel you will modify | Phase 3 |
| **Linux System Call Table (x86_64)** | [https://blog.rchapman.org/posts/Linux_System_Call_Table_for_x86_64/](https://blog.rchapman.org/posts/Linux_System_Call_Table_for_x86_64/) | Single-page reference: syscall numbers, registers, arguments | Phase 3 onward. Pin this tab |

### Domain 4 · Networking & Parser Theory (used in Phase 4)

| Resource | Link | What it teaches | When to use it |
|---|---|---|---|
| **IETF RFC Database** | [https://datatracker.ietf.org/doc/html/rfc9293](https://datatracker.ietf.org/doc/html/rfc9293) | Official protocol specifications. RFC 9293 = TCP. Read the sections you need, not the whole document | Phase 4 |
| **Wireshark** | [https://www.wireshark.org/](https://www.wireshark.org/) | Industry-standard packet inspection. Capture real traffic, dissect every header | Phase 4 |
| **Beej's Guide to Network Programming** | [https://beej.us/guide/bgnet/](https://beej.us/guide/bgnet/) | The classic free guide to sockets in C — the exact `sys/socket.h` APIs you'll write against | Phase 4 |
| **LangSec.org** | [https://langsec.org/](https://langsec.org/) | The formal treatment of "parsers are the security problem" — papers and talks | Phase 4 (theory) and beyond |

### Domain 5 · Vulnerability Research & Exploitation (used in Phase 5)

| Resource | Link | What it teaches | When to use it |
|---|---|---|---|
| **pwn.college** | [https://pwn.college/](https://pwn.college/) | The best free binary-exploitation curriculum on Earth. Free browser Linux terminals (GitHub login). Work through the dojos in the order the platform suggests: start with Program Interaction, then Assembly, Shellcode, Format Strings, and onward | Phase 5 (and its early modules can start in Phase 2 for assembly practice) |
| **ROP Emporium** | [https://ropemporium.com/](https://ropemporium.com/) | 8 step-by-step Return-Oriented Programming challenges (ret2win → ret2csu), each with a written guide | Phase 5 |
| **how2heap (GitHub)** | [https://github.com/shellphish/how2heap](https://github.com/shellphish/how2heap) | Executable C examples of glibc heap exploitation techniques (use-after-free, double-free, house of...), organized by glibc version | Phase 5 |
| **CTFtime** | [https://ctftime.org/](https://ctftime.org/) | Real-time index of global Capture The Flag competitions + team ratings + writeups | Phase 5 and beyond |
| **pwntools** | [https://github.com/Gallopsled/pwntools](https://github.com/Gallopsled/pwntools) | Python exploit-development library (also free docs at [https://docs.pwntools.com/](https://docs.pwntools.com/)) | Phase 5 |

---

## 🌐 Part C · Instant Browser Tools (Zero Installation)

| Tool | Link | What it does | When to use it |
|---|---|---|---|
| **Compiler Explorer (Godbolt)** | [https://godbolt.org/](https://godbolt.org/) | Live C/C++ → assembly converter. Type code left, see machine code right | Phase 1 **daily** — the single most-used tool in this framework |
| **Microcorruption** | [https://microcorruption.com/](https://microcorruption.com/) | Interactive browser-based MSP430 assembly debugging game | Phase 2 |
| **CyberChef** | [https://gchq.github.io/CyberChef/](https://gchq.github.io/CyberChef/) | GCHQ's visual encoding/decoding/byte-manipulation tool (hex, base64, XOR, 500+ operations) | Phases 1, 2, 4 — anytime you need to decode or transform bytes |

---

## 🎬 Part D · Visual High-Yield YouTube Channels

| Channel | Link | What it covers | When to watch |
|---|---|---|---|
| **LiveOverflow** | [https://www.youtube.com/c/LiveOverflow/playlists](https://www.youtube.com/c/LiveOverflow/playlists) | Visual memory-corruption walkthroughs, exploit-dev explanations, hardware hacking | 10-minute "video primer first" before reading dense chapters (learning hack #2) — any phase |
| **Ben Eater** | [https://www.youtube.com/c/BenEater](https://www.youtube.com/c/BenEater) | Building an 8-bit computer on breadboards from logic gates — the ultimate visual for "how do computers actually work" | Phase 1 |
| **Low Level Learning** | [https://www.youtube.com/@LowLevelLearning](https://www.youtube.com/@LowLevelLearning) | Short, bite-sized C, assembly, and vulnerability breakdowns | Any phase — quick refreshers |

---

## 🧭 Part E · The 4 Always-Pinned Browser Tabs (Learning Hack #4)

Keep these four open at all times from Phase 1 onward:

1. **Linux System Call Table** — [https://blog.rchapman.org/posts/Linux_System_Call_Table_for_x86_64/](https://blog.rchapman.org/posts/Linux_System_Call_Table_for_x86_64/)
2. **x86-64 Assembly cheat sheet** — [https://cs.brown.edu/courses/cs033/docs/guides/x64_cheatsheet.pdf](https://cs.brown.edu/courses/cs033/docs/guides/x64_cheatsheet.pdf)
3. **GDB command reference** — [https://sourceware.org/gdb/current/onlinedocs/gdb/](https://sourceware.org/gdb/current/onlinedocs/gdb/) (or a one-page cheat sheet like [https://gdb-tutorial.net/](https://gdb-tutorial.net/))
4. **Compiler Explorer (Godbolt)** — [https://godbolt.org/](https://godbolt.org/)

---

## 💬 Part F · Communities (for when you're stuck — see [12-getting-unstuck.md](12-getting-unstuck.md))

| Community | Link | What it's for |
|---|---|---|
| pwn.college Discord | [https://discord.gg/pwncollege](https://discord.gg/pwncollege) | The best place to ask for hints on pwn.college challenges |
| RE4B Discord | [https://discord.gg/UNsu88RYuN](https://discord.gg/UNsu88RYuN) | Reverse-engineering questions around RE4B |
| Crackmes.one Discord | [https://discord.gg/2pPV3yq](https://discord.gg/2pPV3yq) | Reverse-engineering practice community |
| r/ExploitDev | [https://www.reddit.com/r/ExploitDev/](https://www.reddit.com/r/ExploitDev/) | Exploit development discussion and help |
| r/ReverseEngineering | [https://www.reddit.com/r/ReverseEngineering/](https://www.reddit.com/r/ReverseEngineering/) | RE news and community |
| Stack Overflow | [https://stackoverflow.com/](https://stackoverflow.com/) | For C, sockets, gdb — *specific* questions with code get answers |

**Next:** [`04-mindset-and-schedule.md`](04-mindset-and-schedule.md) — how to think, how to schedule, and the 4 learning hacks that make this pace sustainable.
