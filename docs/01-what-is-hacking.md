# 01 · The Unfiltered Truth of Hacking

> **Reading time: ~10 minutes. This is the foundation — every later phase assumes you understand this page.**

---

## 1. What is Hacking, REALLY?

Hacking is **the art and science of subverting human assumptions**.

Engineers build systems (software, hardware, networks, institutions) by making *mental assumptions* that simplify complexity:

- "The user will never send more than 100 characters."
- "The caller will always check the return value."
- "Only trusted people can reach this interface."
- "This field will always contain a number."

A computer does not care about human intent. **It executes logic and physics literally.** When the real input doesn't match the assumed input, the system's behavior is decided by the *actual* logic — not the intended one.

Hacking exists at the exact boundary where **human intent separates from physical/logical reality**. A hacker finds where a system's assumptions contradict its actual rules, and uses that contradiction to make the system do something its designers never intended.

> **Example:** a web form assumes input is a name. You send `'; DROP TABLE users;--`. The parser assumes data stays data. The database treats it as instructions. Human assumption (input is a name) vs. logical reality (input is text that gets concatenated into a query). That gap is the vulnerability.

---

## 2. The Canvases of Hacking

Web, Network, OS, Android, iOS, IoT, and Hardware are **not different careers**. They are different **canvases** — different surfaces where the same underlying patterns appear.

A real hacker does not care about the label. They see the same things everywhere:

| What you actually look at | What it is |
|---|---|
| **Logic flows** | How data moves from input to decision |
| **Trust boundaries** | Where untrusted input crosses into trusted code |
| **State machines** | The set of states a system can be in, and how it transitions |
| **Parser rules** | The grammar that decides what input means |

You search for one thing on every canvas: **places where the rules contradict themselves.**

This is why this framework teaches you **fundamentals, not platforms**. Once you deeply understand memory, machine code, kernels, and protocols, every new technology is just a new arrangement of things you already know. You will never feel lost again when a new framework or platform appears.

---

## 3. Who is a Hacker?

A hacker is someone who **refuses to accept the default user interface of reality**.

- They don't accept "it just works" — they ask *how*.
- They have an obsessive curiosity about what happens **beneath glossy interfaces**.
- When they see a tool, they wonder what it does with the input they're not supposed to control.
- When they see a system fail, they ask *why* — and what else could make it fail the same way.

You do not need to be a "genius" or a math prodigy. The skills in this repo are built with **consistent, structured practice** (~3.5 hours/day), exactly like learning a language or an instrument. Curiosity is the only requirement you must bring yourself.

---

## 4. Capabilities vs. Limitations

Knowing the *real* power of hacking — and its real limits — protects you from two failure modes: underestimating it (treating it as "typing fast in a black terminal") and overestimating it (believing Hollywood myths).

### ✅ What a hacker CAN do

| Capability | How it works |
|---|---|
| **Asymmetric leverage** | Destroy (or control) an industrial system, grid, or corporation from a laptop — via small, precise logic inputs, not brute force |
| **Exploit physics via software** | Timing side-channel attacks (inferring secrets from *how long* operations take), Rowhammer (flipping memory bits by repeatedly accessing adjacent rows — a *physics* bug in DRAM, triggered from software) |
| **Bypass expensive security controls** | Expensive defenses are often defeated cheaply by targeting the human element (social engineering, phishing) or parser logic (a system that parses input "unexpectedly") instead of the crypto or the firewall |

### ❌ What a hacker CANNOT do

| Myth | Reality |
|---|---|
| "Break AES-256 / RSA by typing fast" | Modern encryption math is **not** broken by "hacking." Attacking crypto means attacking *implementations* (bad randomness, side channels, misconfiguration) — not the math |
| "Hack an air-gapped, powered-down system with no interface" | If a system has **no physical or wireless interface and no power**, there is no attack surface. Period. (Attacks on air-gapped systems always rely on *some* interface: USB drops, supply chain, insiders, EM emissions...) |
| "Override physics and thermodynamics" | You cannot make a machine do the impossible. Exploitation works *within* the laws of physics — that's what makes it reliable |

**Why this matters for your learning:** knowing the limits keeps you focused on what actually gets broken — **implementation flaws, logic bugs, trust boundaries, and assumptions** — rather than chasing impossible fantasies. Every phase of this framework teaches you to find those real flaws.

---

## 5. The Takeaway

1. Hacking = finding where **human assumptions** contradict **logical/physical reality**.
2. Platforms (web, mobile, OS, hardware) are just **canvases** — learn the underlying patterns once, apply them everywhere.
3. A hacker **does not accept "it just works"** — they need to see how things actually function.
4. Hacking is **asymmetric and powerful** — but bounded by math, physics, and interface access. Learn the real bounds and you'll never waste time on fantasy.
5. Everything from here on is **fundamentals-first** — that's the only path that never gets stale.

**Next:** [`02-the-5-domains.md`](02-the-5-domains.md) — the 5 non-negotiable technical domains that form your knowledge skeleton.
