# The Community — how it works, and what it does not do yet

The pattern community at [community.patternflow.work](https://community.patternflow.work/community):
publishing, forking, comments, moderation, and the deck you build onto a board.

This page is the map. It says what exists, why some of it is shaped the way it
is, and — at the bottom — what is deliberately missing, so nobody has to read
the source to find out.

**Last reviewed:** 29 July 2026

---

## Where it runs

The community is one Next.js app backed by **one SQLite file**. Backup is
copying the file.

It only runs where `COMMUNITY_ENABLED=1` is set, which is the self-hosted box.
Every other deployment of this repo — including the Vercel mirror of the main
site — serves the community routes as a pointer to the real host. That is why
the code checks `communityEnabled()` before touching the database: importing
the module must never open a file on a deployment that has none.

| Piece | What it is |
| :--- | :--- |
| Web server | Next.js, `patternflow-community.service` |
| Build worker | Separate process, `patternflow-worker.service` — compiles submitted C++, and runs the retention sweep daily |
| Database | SQLite via Drizzle. Migrations in `web/drizzle/`, applied automatically on first open |
| Auth | Better Auth — username + password. Email is optional and recovery-only |

Operational commands are in [SERVICES.md](SERVICES.md).

---

## Patterns

A pattern is JavaScript. The stored source is the **source of truth**, and it
carries its own licence header and attribution footer — rebuilt from the
database row on every save, never trusted from user input. Most people copy
code out of the page rather than downloading a file, and a licence that only
exists in the download is a licence most readers never see.

**The firmware header (`.h`) is separate and optional.** It is the author's
hand-verified C++ port, attached after the fact; a pattern that has one is
"hardware ready" and can be flashed or built into a module directly. It is
never auto-generated and never carried across a fork — the JavaScript may have
changed, which would make the port a lie.

**Untrusted code only ever runs inside a sandboxed iframe**
(`web/public/pattern-sandbox.html`, `sandbox="allow-scripts"`, opaque origin,
postMessage protocol). That boundary is what makes "edit anyone's pattern in
the browser with no account" safe. The sandbox duplicates the pattern harness
on purpose — keep the two in step when the pattern contract changes.

### Licences

Two options, chosen by the author at publish time:

| SPDX | What it means |
| :--- | :--- |
| `CC-BY-SA-4.0` (default) | Free to use and adapt, including commercially, with credit. **Adaptations carry the same licence.** |
| `CC-BY-4.0` | Same, but adaptations may use any licence. |

MIT and CC0 were retired from the picker. Patterns published under them keep
those terms — a licence grant cannot be withdrawn — and an unrecognised SPDX id
is passed through rather than silently relabelled.

Full breakdown: [LICENSE-SUMMARY.md](LICENSE-SUMMARY.md).

### Forks

A fork is a derivative, so two rules are enforced rather than hoped for:

1. **It cannot be looser than its parent.** A fork of a CC BY-SA pattern must
   also be CC BY-SA. The publish picker only offers what the API accepts, and
   the API checks again.
2. **It credits its parent in the source.** The header gains a `Based on:` line
   naming the original author and linking the pattern. It is rebuilt from the
   parent row on every save, so it cannot be edited away — and it matters
   because the code is the thing that leaves, as a download, a paste, or a
   compiled `.pfm`. The database's `parent_id` does not travel with the file.

### Provenance

Two different things sit side by side on a pattern page.

**The author's declaration** (`made_how`) — written by hand, AI-assisted, or
AI-generated then edited. Using AI is not a mark against anything: Pattern Lab
is built for it. Saying so plainly is what makes the answer worth having.

**Signals read out of the source** — a colour ramp (`@ramp`), declared knob
ranges (`@knobs`), a layer stack (`@stack`), a composed frame (`@matrix`), a
hardware-verified header. Pattern Lab writes these while the author works.

This is a record, not a score. A pattern with none of them is not accused of
anything.

> **Known limitation.** Two of those signals — `@knobs` and `@matrix` — are
> emitted by the AI generation prompt itself, so they appear on a one-shot
> generated pattern too. And any of them can be typed by hand. They are honest
> about what was seen in the file; they are not proof of human authorship, and
> should not be presented as such if anything ever depends on it.

---

## Moderation

| Capability | Who |
| :--- | :--- |
| Edit own pattern / post / comment | The author only |
| Delete own pattern / post / comment | The author |
| Delete anyone's pattern / post / comment | Moderators |
| Edit anyone's content | **Nobody** |

That last row is deliberate. Removing someone's content is moderation;
rewriting it while their name stays on it is putting words in their mouth.

Moderators come from `COMMUNITY_ADMIN_USERNAMES` — a comma-separated list of
usernames in the environment, not a database column. Changing it needs shell
access to the server, which is a stronger control than a permissions UI. Unset
means nobody, which is what every clone of this repo gets.

**Reporting.** Every pattern has a Report control; rights holders who are not
members use the address in the [terms](https://patternflow.work/terms).
Reports land in a queue at `/community/reports`, visible to moderators and a
404 for everyone else.

A report deliberately carries **no foreign key** to what it points at. The
record has to outlive the removal, because "this author has been reported four
times" is the only signal that separates a repeat problem from noise — and a
cascade would erase exactly that at the moment it starts to matter.

Closing a report never removes anything. Reports cannot be edited: a record you
can rewrite is not a record.

---

## Deck and Saved

Two lists, both in the browser's local storage. They hold copies of things that
could be re-collected in a minute, so losing them costs nothing — and keeping
them out of the database means no schema, no "whose deck is this", and no sync.

| | Saved | Deck |
| :--- | :--- | :--- |
| Size | Unbounded | Capped at what one build holds |
| Order | None | **Ordered, and reorderable** |
| Builds | No | Yes — one `.pfm` bundle |

The cap on the deck is a fact about firmware, not about how many patterns
somebody may like. The order is the point: the device cycles patterns with a
long press on encoder 4, so a deck is a setlist, not a folder.

Saving works on any pattern. Building does not — a pattern with no firmware
header has nothing to compile, so promoting it is refused with the reason
rather than sending an empty file to the compiler.

---

## Data and retention

Written into the [terms](https://patternflow.work/terms), and enforced by a
sweep the build worker runs daily (`npm run sweep`, or `-- --dry-run` to look
first).

| Data | Kept |
| :--- | :--- |
| Sessions (incl. IP and user-agent) | Until they expire, and at most **90 days** |
| Verification tokens | Until they expire |
| Build artifacts and build rows | **30 days** — they can always be rebuilt |
| Unreferenced artifact files | Swept after a 24-hour grace window |
| Reports | Kept after the reported content is gone |
| Patterns, posts, comments | Until removed |

Changing a retention period means changing the constant in
`web/src/lib/community/retention.ts` **and** the terms. Both, or the terms stop
being true.

---

## Tests

Four suites, all runnable without a server:

```bash
cd web
npm run check:license      # licence headers, fork compatibility, downloads
npm run check:moderation   # admin env parsing, report input
npm run check:retention    # the sweep, against a throwaway database
npm run check:deck         # deck cap, ordering, legacy migration
```

They exist for the failures that are silent. A sweep that deletes too little
makes the terms a lie; one that deletes too much destroys someone's work.
Neither announces itself.

---

## Not built yet

Listed because "is this missing or am I holding it wrong" deserves an answer.

| | Status |
| :--- | :--- |
| **Pattern visibility (public / private)** | Not built. Everything published is public immediately. Tracked as an issue. |
| **Shareable decks** | Not built. A deck lives in one browser and cannot be sent to anyone. Tracked as an issue. |
| **Tags and search** | Not built. The feed sorts by new / most liked / most forked, and filters for hardware-ready. |
| **Self-serve account deletion** | Not built. Requests go to the address in the terms and are handled by hand. Published patterns are anonymised rather than removed — the licence granted is irrevocable and others may have built on them. |
| **Email of any kind** | Not sent, ever. No verification, no notifications, no password-reset mail. |
| **Approval queue for new patterns** | Not built, and not currently wanted — moderation is after the fact. |
| **Lineage tree view** | Not built. A fork links to its parent; there is no graph. |

---

Corrections and additions welcome — see [CONTRIBUTING.md](../CONTRIBUTING.md).
