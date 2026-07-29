# Patternflow Manifesto

*Why this work exists, and how we talk about it.*

This document is public for the same reason the schematics are. If you build a
Patternflow, write about one, translate a page, pitch it to someone, or make
something alongside it, this is what the project believes and the words we've
settled on for saying it. Use them. Argue with them in an issue if they're wrong.

It comes in two parts. §1 is the argument — why this work exists. Everything
after it is the vocabulary — how we say it, everywhere we say it. The argument is
the reason the vocabulary is worth keeping fixed.

---

## 1. The argument

Almost all the light in our lives is playback. Screens, signage, the panel in
your pocket — someone else made the image and it runs at you. You can look away,
but you can't reach into it.

Art has had an answer to this for sixty years. In 1963 Nam June Paik wired a
television so that the audience's own voice reshaped the image on the screen;
*Participation TV* made the viewer part of the work. But the answer stayed inside
galleries, because objects you can reach into are expensive. Interactive media
art runs on serious capital, custom engineering, and years of specialized skill.
That fee is real, and it gets paid long before anyone participates in anything.

Patternflow is what happens when you refuse to pay it. Four knobs, an LED matrix,
and about a hundred dollars in parts. The schematics, the firmware, the enclosure
models, and the patterns are all public. An hour of through-hole soldering and
it's yours — not a copy of ours, yours, in whatever material you decided to cut
it from.

Then the part that matters most: what you make plays on everyone else's. A
pattern is a small file, and it runs on any Patternflow in the world. Paik let
the audience change the image. Patternflow lets you make it — and give it away.

So this isn't a project about making art easier to watch. Watching was never the
hard part.

> **We're not making art easier to watch. We're making it easier to make.**
>
> 우리는 예술을 보기 쉽게 만드는 게 아니라, 만들기 쉽게 만듭니다.

### 우리가 하는 말

우리 삶의 빛은 거의 다 재생입니다. 화면, 간판, 주머니 속 패널 — 누군가 만든
이미지가 우리를 향해 흐릅니다. 고개를 돌릴 수는 있어도, 손을 넣을 수는 없습니다.

예술은 이 문제에 육십 년 전부터 답을 갖고 있었습니다. 1963년 백남준은
텔레비전에 관객의 목소리가 닿게 만들어, 보는 사람이 화면의 이미지를 직접
일그러뜨리게 했습니다. 《Participation TV》는 관객을 작품의 일부로 만들었습니다.
하지만 그 답은 미술관 안에 머물렀습니다. 손을 넣을 수 있는 물건은 비싸기
때문입니다. 인터랙티브 미디어 아트에는 자본과 맞춤 엔지니어링과 수년의 숙련이
듭니다. 그 비용은 실재하고, 누가 무언가에 참여하기 한참 전에 먼저 지불됩니다.

Patternflow는 그 비용을 내지 않기로 한 결과입니다. 노브 네 개, LED 매트릭스,
부품값 백 달러 남짓. 회로도와 펌웨어와 케이스 모델과 패턴이 전부 공개되어
있습니다. 한 시간쯤 납땜하면 당신 것이 됩니다. 우리 것의 복제가 아니라, 당신이
고른 재료로 만든 당신 것.

그리고 가장 중요한 부분. 당신이 만든 것은 다른 모든 사람의 기기에서도
연주됩니다. 패턴은 작은 파일이고, 세상의 어떤 Patternflow에서도 돌아갑니다.
백남준은 관객이 이미지를 바꾸게 했습니다. Patternflow는 당신이 그것을 만들고,
건네주게 합니다.

그러니 이건 예술을 보기 쉽게 만드는 프로젝트가 아닙니다. 보는 건 원래 어려운
일이 아니었습니다.

---

## 2. The fixed lines

Five layers. They stack. Short surfaces use the first two; long surfaces use all
five. The wording does not change from place to place — that is the entire point
of having them.

English is primary. Korean is not a translation; both are written as originals
and both are canonical.

### L1 — What it is

> **Patternflow is an open-source LED synthesizer.**
>
> Patternflow는 오픈소스 LED 신디사이저입니다.

Never rephrase this. Not "LED matrix display," not "generative light device," not
"pattern controller." *Synthesizer* is doing specific work — see §4.

### L2 — What you do with it

> **Play light patterns with your fingertips.**
>
> 손끝으로 빛을 연주합니다.

Short form, for bios and badges: **Play light with your fingertips.**

The verb is always *play*. Not operate, not control, not configure.

### L3 — What it becomes

> **Every Patternflow plays every pattern we make.**
>
> 모든 Patternflow는 우리가 만든 모든 패턴을 연주합니다.

A description of how the system works, not a promise about how good it is. That
is why it is the strongest line we have — there is nothing in it to disbelieve.

> **Note for firmware and hardware work:** this line is also an engineering
> commitment. A Patternflow that cannot play a pattern made on a different
> Patternflow breaks it. Keep pattern formats resolution-independent and
> forward-compatible — or change this line first and the code second.

### L4 — How we work

> **Make it easy. Make it fun. Make it yours.**
>
> 쉽게, 재밌게, 그리고 당신 것으로.

Three jobs: *easy* is the barrier, *fun* is the reason, *yours* is the license.
Drop any one and the sentence stops being complete.

### L5 — Where it comes from

> **A contemporary reinterpretation of Nam June Paik's *Participation TV* (1963).
> Paik let the audience change the image. Patternflow lets you make it — and give
> it away.**
>
> 백남준의 《Participation TV》(1963)에 대한 동시대적 재해석입니다. 백남준은
> 관객이 이미지를 바꾸게 했고, Patternflow는 당신이 그것을 만들고 건네주게 합니다.

Depth, not headline. This belongs in campaign bodies, the journal, artist
statements, exhibition text, and academic writing. It does **not** belong in
social bios, one-line repo descriptions, or ads — a reader who doesn't know Paik
gets nothing from it, and a reader who does will find it soon enough.

---

## 3. Boilerplate

Copy these as-is. For press, directories, applications, and anyone who asks for
"a short description."

**~25 words**

> Patternflow is an open-source LED synthesizer. Turn four knobs and play living
> patterns of light — and every Patternflow plays every pattern we make.

**~50 words**

> Patternflow is an open-source LED synthesizer. Turn four knobs and play living
> patterns of light with your fingertips. Interactive media art usually demands
> capital, custom engineering, and years of specialized skill; Patternflow removes
> that entry fee. Everything is public, and every Patternflow plays every pattern
> we make.

**~100 words**

> Patternflow is an open-source LED synthesizer. Four rotary encoders reshape
> generative light patterns on an LED matrix in real time — a contemporary
> reinterpretation of Nam June Paik's *Participation TV* (1963). Paik let the
> audience change the image; Patternflow lets you make it, and give it away.
> Interactive media art usually demands serious capital, custom engineering, and
> years of specialized skill. Patternflow removes that entry fee: the schematics,
> firmware, enclosure models, and patterns are all public, and anyone can build
> one by hand. Make a pattern, share it, and it plays on every Patternflow in the
> world.

Keep component names out of the short versions. Nobody outside the maker world
knows what an ESP32-S3 is, and inside the maker world they'll read the spec table
anyway.

---

## 4. Why these words

**"Synthesizer" is not a metaphor.** The synthesizer is one of the few
twentieth-century instruments that could only exist because circuit designers and
composers sat at the same table. It produced a culture where people build
patches, share them, fork someone else's, and make it their own. Patternflow
inherits that social form, not just the knobs. When makers, artists, and
musicians turn up in the same room, that isn't a coincidence — it's the category
working as intended.

**"Play" over "control."** A thing you control does what you tell it. A thing you
play answers back. Patternflow answers back — that's what the four encoders are
for.

**"Creation," never "authorship."** We are not redistributing ownership of art.
We are lowering the cost of the act of making. Ownership is a legal question and
the licenses answer it; creation is what actually changes when someone turns a
knob for the first time and realizes they could make one of these.

**"Popularizing interactive media art" is imprecise, and we avoid it.**
Popularizing usually means lowering the cost of *consuming* something. We lower
the cost of *making* it. Those are different projects, and ours is the rarer one.
The one sentence that carries it is at the end of §1.

---

## 5. Who "we" is

**We** is everyone who makes Patternflow — not a company, not a team, not the
person who started it.

Concretely: anyone with a pin on the [build map](https://patternflow.work/inside),
anyone who has published or forked a pattern, anyone who has opened a pull
request or answered a build question in Discord, and anyone who ships one of
their own with the enclosure cut from a material nobody has tried yet.

This isn't a rhetorical *we*. It's checkable — the map and the pattern community
are the record, and both are public.

Patternflow started as one person's project and says so plainly in the journal.
The move from *I* to *we* is the story, not a marketing decision. Both stay in
the writing: the journal is first person, everything forward-facing is *we*.

---

## 6. How we treat each other

The oldest part of this document. It was written as a short poem in Korean before
there was anything to sell or explain, and it is kept because it still describes
how the project actually runs — the Discord, the build map, and the pattern
community all behave this way or they stop working.

**You don't have to be special.** Nobody arrives knowing how to do this. The
first Patternflow was built by someone who didn't know how to build one. Wanting
to make it is the qualification; knowing nothing at the start is the normal
condition, not a disqualification.

**Helping is ordinary, not generous.** Someone answering a build question in
Discord isn't doing you a favor — it's what the room is for. Say thank you when
you can. When you can't, we still know.

**What you receive, you pass on.** Everything here was published by someone. The
natural response isn't gratitude alone but publishing something back: a pattern,
a fix, a better photo of a step in the build guide, an answer to the question you
had last month. Giving is the part to be proud of.

**That's what connects us.** Not a brand and not a follower count — a chain of
people who were helped and then helped.

> 아무것도 몰라도, 하고자 한다면 만들 수 있습니다.
> 도와주는 게 당연합니다. 고마운 게 당연합니다.
> 말하면 더 좋고 안 해도 압니다.
> 받았으면 주고, 주는 걸 자랑스러워 합니다.
> 그렇게 우리는 연결됩니다.

**In writing, describe this — never demand it.** "Come share it in Discord and
your build goes on the map" is an invitation. "Give back to the community" is a
bill.

---

## 7. What we're against

Copy is sharper when it stands against something. Two things:

**Screens you only watch.** Most light in our lives is playback — something
someone else made, running at us. Patternflow is the opposite motion: light that
changes because your hand moved.

**Interactive installations that need capital and credentials.** Serious money,
custom engineering, and years of specialized skill are the standing entry fee for
this kind of art. That fee is what keeps most people out, and removing it is the
project.

Never name competitors or other products. The opposition is a condition, not a
company.

---

## 8. Voice

**Plain, specific, unhurried.** Short declaratives. Concrete nouns. No
exclamation marks in body copy.

**Show the object, don't praise it.** "Turn a knob and the light answers" beats
"an incredible interactive experience." If a sentence would still be true about a
different product, it isn't about Patternflow.

**Never oversell how easy the build is, and never undersell it either.** The
soldering really is easy — every joint is through-hole and the board was stripped
down on purpose. Say that. Also say that parts take weeks to arrive and printing
runs overnight. People trust a project that tells them the boring parts.

**Admit what's unfinished.** Hardware revisions get reversed, features go on
hold, campaigns move slower than expected. That's already in the journal and it's
an asset, not a liability. A project that only publishes wins reads like an ad.

**Invite, don't recruit.** "Come share it in Discord and your build goes on the
map" works. "Join the movement" doesn't.

---

## 9. Say this, not that

| Say | Not |
| --- | --- |
| LED synthesizer | LED display, light panel, pattern controller |
| play | operate, control, configure, drive |
| pattern | effect, animation, visual, scene |
| make, create | author, generate, produce |
| open source | free, DIY-friendly, hackable |
| build map, build one | user base, customers, users |
| living, generative | dazzling, stunning, mesmerizing |
| people who build one | backers, buyers, adopters |
| easy, fun | intuitive, seamless, immersive |

*Dazzling light show* in particular: it reads as party gadget, and it undoes L1
one line after we established it. Avoid.

**One exception.** Crowd Supply's own interface calls people *backers*, and
fighting a platform's vocabulary on its own page reads as evasive rather than
principled. Use the platform's word inside the platform, and *people who build
one* everywhere else.

---

## 10. Naming

These names are canonical. Use them exactly, capitalized as shown.

| Name | What it is |
| --- | --- |
| **Patternflow** | The instrument, the project, and the ecosystem. One word, capital P only. A trademark of SeungHun Lee. |
| **Live Editor** | The taster, embedded in the website. A virtual Patternflow — same knobs, same detents, no account, no install, no hardware. |
| **Pattern Lab** | The studio. A full creation tool: batch generation, color ramps, layering, custom knob frames, compile straight to firmware. |
| **Community** | The sharing platform. Publish, browse, fork, and load a pattern onto your own device. |
| **Origin** | The pattern the device boots into, and the first work in the Patternflow series. |

**The Live Editor and Pattern Lab are not two versions of the same thing.** The
Live Editor exists so that someone who has never heard of Patternflow is playing
within seconds of landing on the page — it stays light on purpose, and adding
depth to it is a mistake. Pattern Lab is a real tool for people who keep making,
closer in kind to a design application than to a widget; it is allowed to be
complex, and describing it as "simple" undersells it.

> **The Live Editor is where you find out you want to make patterns. Pattern Lab
> is where you make them.**

One sentence for the whole pipeline, when it needs explaining in order:

> **Try it in the Live Editor, make it in Pattern Lab, share it on Community —
> and it plays on every Patternflow in the world.**

---

## 11. Surfaces

Which layers go where.

**Social bio, OG description, badge, one-liner** — L1 + L2

> Patternflow — an open-source LED synthesizer. Play light with your fingertips.

**Repo description, link previews, short intros** — L1 + L2 + L3

> An open-source LED synthesizer. Play light patterns with your fingertips — and
> every Patternflow plays every pattern we make.

**Website hero** — L1 + L2, using L2's short form: the kicker sits directly under
the wordmark and the full L2 pushes it onto an extra line at every breakpoint.
The second beat expands L2 rather than jumping ahead to L3: *"Four knobs. The
pattern answers as you turn them."* Say what the thing does before saying how far
it reaches. L3 lands after the video, once the device has been seen moving.

**L5 does not run in the hero.** §2 keeps it out of headline surfaces, and the
hero is the most headline-like surface we have — running it there was this
document contradicting itself. A one-line mono footnote points to it instead:

> After Nam June Paik's *Participation TV*, 1963 — read why ↗

That is a signpost, not a shortened L5. L5 itself is unchanged and still runs in
full everywhere §2 sends it. Every hero paragraph should map to a layer; if it
maps to none, it is probably restating a button.

**README opening** — L1 + L2 + L3, with L5 in the section explaining the idea.

**Campaign body, journal, statements, applications** — all five, in order.

**Talks and pitches** — open with the one-liner from §1 ("not easier to watch,
easier to make"), then L1, then the build map as evidence.

---

## 12. Proof

Numbers age. These don't, so prefer them:

- **The build map.** People in different countries have built a Patternflow by
  hand, from published files, and each one is a pin. This is the only direct
  evidence that the barrier actually came down — a star is interest, a pin is
  someone who did it.
- **Community patterns.** Patterns made by people other than whoever made the
  instrument, playable on anyone's device.
- **Collaborations.** Separate works made *with* Patternflow rather than builds
  *of* it. On the map these are rings rather than dots.
- **The journal.** Written continuously since the beginning, including the parts
  that went badly.

If a specific number is needed for a particular pitch, use it there and keep it
out of anything permanent. Nothing in this document should need updating because
a counter moved.

---

## 13. Fixed disclosures

Include wherever the device is shown in motion — product pages, campaign pages,
the repo, and video descriptions.

> **Photosensitivity warning.** Patternflow displays rapidly changing light
> patterns that may trigger seizures in people with photosensitive epilepsy.
> Viewer discretion is advised. If you experience any discomfort, stop use
> immediately.

Licensing, stated plainly wherever files are offered:

> Firmware and web — MIT. Hardware, designs, and patterns — CC BY-SA 4.0.
> Community pattern submissions are inbound = outbound, with attribution kept in
> the code header. "Patternflow" is a trademark of SeungHun Lee.

---

## 14. Changing this document

The fixed lines are meant to be boring. Their value comes from being identical
everywhere for a long time, and rewriting them every few months destroys the
thing they're for. A line feeling stale to the person who has read it a thousand
times is not a reason to change it.

Change them when the project actually changes. If you think a line is wrong, open
an issue with the replacement written out in full and a note on what it would
break.

Translations follow the same rule: each language gets its own canonical wording,
written to work in that language rather than mapped word-for-word from English.
Add yours in a pull request.
