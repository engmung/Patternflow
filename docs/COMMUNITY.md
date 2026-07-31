# The Community — how it works, and what it does not do yet

The pattern community at [community.patternflow.work](https://community.patternflow.work/community):
publishing, forking, comments, moderation, shared decks, and the deck you build
onto a board.

This page is the map. It says what exists, why some of it is shaped the way it
is, and — at the bottom — what is deliberately missing, so nobody has to read
the source to find out.

**Last reviewed:** 1 August 2026

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

### Visibility

Three states, chosen at publish time and changeable afterwards from the
pattern's page:

| State | In the feed | Reachable by link | Who can open it |
| :--- | :--- | :--- | :--- |
| Public (default) | yes | yes | everyone |
| Unlisted | no | yes | anyone with the link |
| Private | no | no | the author |

Unlisted is the one that earns its keep: it is how you show someone a pattern
before posting it — and how a pattern can sit in a shared deck without being
in the feed. Publishing still defaults to public, because the community works
by things being shared.

Details that follow from it:

- A **private pattern cannot be forked** by anyone but its author — a fork
  bakes a credit link into its source, and that link would 404 for every
  reader. Unlisted patterns fork normally.
- A pattern that goes private **after** being forked keeps its credit in the
  fork's source (that cannot be edited away), but the fork's "forked from"
  line drops the link.
- Moderators can still open anything: visibility is not a shield from a
  report.
- Every listing query filters on visibility. When adding a new read path,
  start from `feedVisible` in `queries.ts` — a missed filter is a leak.

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

### Shared decks

The working deck above stays browser state. **Sharing one is an explicit act**
("Share deck" in the Deck panel): it stores a titled snapshot of the ids and
their order, and gets a page at `/community/d/[id]` plus a listing under the
community's **Decks** tab. Decks take the same three visibility states as
patterns.

Two rules carry the design:

- **Two public decks per account.** A curation policy, not a technical limit —
  the deliberate opposite of the build cap. Publishing a deck spends one of two
  slots, so a published deck is staked reputation rather than overflow storage:
  a shelf you must ration is a shelf you curate. Private and unlisted decks are
  not rationed. (`PUBLIC_DECKS_MAX` — raising it is easy; lowering it would
  strand people over the limit, which is why it starts small.)
- **No private patterns in a shared deck.** Unlisted ones are welcome — that is
  the "in a deck but not in the feed" state working as intended.

What follows from a deck being somebody's arrangement:

- A slot whose pattern was deleted, or made private since, renders as a **gap**
  with the title it had — never a silently shorter set.
- Every slot renders the pattern's own card, author byline included. The deck
  is the arrangement; the patterns stay their authors'.
- "Copy to my deck" loads a shared deck into the working deck, order intact, so
  a shared deck is a starting point rather than a read-only artifact.
- **"In decks" is a feed sort**: it counts how many *other* people put a
  pattern in a public deck (distinct people, own decks excluded). It ranks
  better than likes because it costs one of somebody's two slots.
- Decks are reportable and moderator-deletable like everything else, and the
  build path is untouched: a copied deck builds exactly as the working deck
  always has.

---

## Alerts

In-app notifications — the header shows **Alerts (n)** while anything is
unread, and `/community/notifications` lists them. Opening the page marks
everything read.

Four things produce one:

| Event | Who hears about it |
| :--- | :--- |
| A comment on your pattern or post | you |
| A comment on something you commented on earlier | everyone earlier in the thread |
| Your pattern gets forked | you (private forks tell nobody — their page would 404) |
| Your pattern enters someone's **public** deck | you (quieter decks tell nobody — the deck author chose not to list them) |

The second row is what "reply to my comment" means on a flat thread — there is
no comment threading, so participation in the thing is the unit.

What it deliberately is not:

- **Not email, not push.** Nothing leaves the site, ever — most accounts have
  no real address, and the terms promise no mail. Delivery is the next page
  load.
- **Not a record.** The opposite of a report: deleting content deletes the
  notifications about it, and the rest age out after 90 days, read or not.
  Nobody is notified of their own actions, and repeat events (a deck flipping
  visibility) are absorbed while the first row is unread.

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
| Notifications | **90 days**, read or not — and gone sooner if their subject is deleted |
| Reports | Kept after the reported content is gone |
| Patterns, decks, posts, comments | Until removed |

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
npm run check:sharing      # visibility read paths, shared-deck rules, gaps
npm run check:notify       # notification fan-out, cleanup, age-out
```

They exist for the failures that are silent. A sweep that deletes too little
makes the terms a lie; one that deletes too much destroys someone's work.
Neither announces itself.

---

## Not built yet

Listed because "is this missing or am I holding it wrong" deserves an answer.

| | Status |
| :--- | :--- |
| **Tags and search** | Not built. The feed sorts by new / most liked / most forked / in decks, and filters for hardware-ready. |
| **Self-serve account deletion** | Not built. Requests go to the address in the terms and are handled by hand. Published patterns are anonymised rather than removed — the licence granted is irrevocable and others may have built on them. |
| **Email of any kind** | Not sent, ever. No verification, no notification, no password-reset mail — alerts exist only inside the site. |
| **Approval queue for new patterns** | Not built, and not currently wanted — moderation is after the fact. |
| **Lineage tree view** | Not built. A fork links to its parent; there is no graph. |

---

Corrections and additions welcome — see [CONTRIBUTING.md](../CONTRIBUTING.md).
