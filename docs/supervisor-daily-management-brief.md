# Production supervisor daily-management documentation — source-grounded design brief

**Purpose.** Define what a production supervisor's daily-management documentation must contain, derived from TPM and Lean practice, and state per document type which fields/sections are required. It is the reference for the vault content tracked in the follow-up issues below.

**Evidence classes.** Every claim below is marked:

- **STANDARD** — a published standard, a regulator's guidance, or the originating institute (JIPM, ISO, BSI, HSE, Energy Institute, ASQ, LEI).
- **OPINION** — consultancy or vendor practice, or a site convention with no published standard behind it. Useful, but do not present it as required.

Where sources disagree, the disagreement is stated rather than resolved silently. Several terms (OAE, 5S scoring, the SQCDP letter set) have **no** standard definition.

---

## (A) TPM pillars — and what each asks of a supervisor daily

JIPM, which introduced TPM in 1971, groups its pillars into four loss-reduction pillars, two enabling pillars, and two that are *"possible to add / correct accordingly, depend on the company or factory"* — the pillar list is therefore **not one canonical standard** ([JIPM](https://jipmglobal.com/tpm/about_us_en)). The widely circulated 8-pillar names come from JIPM's own consultancy arm ([JMAC](https://tpm.jmac.co.jp/news/details/6517.html)).

| Pillar | Day-to-day supervisor demand |
|---|---|
| Focused Improvement (kobetsu kaizen) | Quantify losses on your line; keep an improvement list with owners and dates |
| Autonomous Maintenance | Operators clean/inspect/lubricate their own equipment; checklists signed daily; tags raised and closed |
| Planned Maintenance | Report degradation found; respect PM windows; record breakdowns that should have been prevented |
| Quality Maintenance | Maintain the conditions that prevent defects; record defect conditions, not just defects |
| Early Management (new product/equipment) | Feed startup losses and lessons into the next launch |
| Education & Training | Track the skill matrix; train on standard work; verify by observation |
| Office TPM | Non-production functions remove their own losses (admin delays, paperwork) |
| Safety, Hygiene, Environment | Zero-accident behaviour; report near-misses daily, not monthly |

**STANDARD:** the pillars, their grouping and the loss focus ([JIPM](https://jipmglobal.com/tpm/about_us_en)); TPM is defined in JIS Z8141:2001 and required as a *documented* system by IATF 16949, with BSI PAS 1918:2022 giving TPM KPI guidance (JIPM involved).

The taxonomy a supervisor's log must be able to classify is JIPM's **16 major losses**, of which 8 are equipment losses with numeric thresholds: breakdown = repair time **>5–10 min**; minor stop/idle = **<5 min**; plus setup/adjustment, tool change, startup, speed, defect/rework and shutdown losses ([JMAC](https://tpm.jmac.co.jp/news/details/6529.html)).

## (B) OEE — facts and benchmarks

- **Formula.** OEE = Availability × Performance × Quality, equivalently (Good Count × Ideal Cycle Time) / Planned Production Time ([oee.com](https://www.oee.com/oee-factors/), [leanproduction.com](https://www.leanproduction.com/oee/)).
- **A** = Run Time / Planned Production Time (losses: unplanned stops *and* planned stops such as changeover). **P** = (Ideal Cycle Time × Total Count) / Run Time (slow cycles + small stops). **Q** = Good Count / Total Count — first-pass-yield logic, so rework counts against Quality ([oee.com](https://www.oee.com/oee-factors/)).
- **Benchmarks (STANDARD-in-practice, from Nakajima 1984):** 85% = world class for discrete manufacturing; 60% = fairly typical; 40% = common for beginners. JIPM award-winning plants all exceeded 85% ([oee.com](https://www.oee.com/world-class-oee/), [leanproduction.com](https://www.leanproduction.com/oee/)).
- **OPINION / caveat:** oee.com (Vorne) warns there is *no* universal benchmark — the 85% figure is Japan/1970s/automotive in origin, most plants sit near 60%, and dissimilar processes should not be compared. Target improvement, not the absolute number.
- **STANDARD:** OEE is defined in **ISO 22400-2:2014** ([ISO](https://www.iso.org/standard/54497.html), framework in [22400-1](https://www.iso.org/standard/56847.html)) and referenced by IATF 16949.
- **Loss buckets:** the Six Big Losses (equipment failure, setup/adjustment, idling/minor stops, reduced speed, process defects, reduced yield) map 1:1 onto A/P/Q ([oee.com](https://www.oee.com/oee-six-big-losses/)).
- **Shop-floor variant (OPINION):** TAED (Target / Actual / Efficiency / Downtime) is recommended over raw OEE for operators, since OEE is too abstract minute-to-minute ([leanproduction.com](https://www.leanproduction.com/oee/)).

## (C) Lean daily management — what it demands of a daily log

| Element | What it demands be recorded | Source |
|---|---|---|
| SQCDP board (Safety, Quality, Cost, Delivery, People) | One actual-vs-target entry per letter, per day, plus the red item needing action. BAE Systems ran SQCDP inside a QDCM variant at Samlesbury, with a scheduled weekly SQCDP review | [The Manufacturer](https://www.themanufacturer.com/articles/lean-mean-flying-machines/) |
| Tiered huddles | Small (5–15 people), *connected* tiers so issues escalate upward and answers come back down; every attendee reports daily | [LEI](https://www.lean.org/the-lean-post/articles/how-we-improved-our-tiered-daily-huddles/) |
| Huddle content | Identify where expected outcomes were missed, and *who* will investigate or which countermeasure to try | [LEI lexicon](https://www.lean.org/lexicon-terms/huddles/) |
| Daily management ↔ strategy | Daily management is the enabler of hoshin kanri; without it, firefighting crowds out strategy | [LEI](https://www.lean.org/the-lean-post/articles/daily-management-connects-an-organizations-actions-to-strategic-targets/) |
| Standard work | Documented via takt time, work sequence, standard WIP; three forms: process capacity sheet, work combination table, standardized work chart | [LEI](https://www.lean.org/lexicon-terms/standardized-work/) |
| Andon | Signals an *abnormality* (downtime, quality problem, tooling fault, material shortage) and summons a team-leader response; Toyota's fixed-position stop is the reference design | [LEI](https://www.lean.org/lexicon-terms/andon) |
| Gemba walk | Grasp the situation by direct observation *before* acting; follow a product or process end to end | [LEI](https://www.lean.org/lexicon-terms/gemba-walk) |
| Leader standard work | Five daily tools: gemba walks, reflection meetings, andon response, creating accountability, mentoring | [LEI](https://www.lean.org/lexicon-terms/leader-standard-work) |
| Kaizen | PDCA-based; *"there can be no kaizen without a standard"* — the standard must be updated after each gain | [LEI](https://www.lean.org/lexicon-terms/kaizen/) |
| A3 / PDCA | One page: background, current state, root cause, actions, expected result | [LCI](https://leanconstruction.org/lean-topics/a3/) |
| 5S | Sort, set in order, shine, standardize, sustain — *"a place for everything and everything in its place"* | [ASQ](https://asq.org/quality-resources/five-s-tutorial) |

**OPINION:** there is no standard for the *letter set* (SQCDP vs SQDCP vs SQDCIP vs Boeing-style PQVC) or for 5S audit scoring scales — both are organisation conventions. Tier numbering (which tier is the plant) also varies by site; LEI describes "tiers" without fixing numbers.

## (D) Shift handover

HSE (UK regulator) defines handover as three elements — **preparation by the outgoing crew, a face-to-face exchange, and cross-checking by the incoming crew** — and requires that handover be face-to-face, two-way, verbal *and* written, with documented procedures ([HSE](https://www.hse.gov.uk/humanfactors/topics/shift-handover.htm)). It notes most handover-related accidents involved **planned maintenance work**, citing Piper Alpha (Cullen Report) and the 1983 Sellafield Beach incident. The Energy Institute requires clear written guidance describing the key information to be exchanged ([EI HF Briefing Note 10](https://www.energyinst.org/industry/publications/topics/human-and-organisational-factors/human-factors-briefing-note-no.-10-communications)).

**Scope note:** this guidance is normative for safety-critical / process industry. Discrete manufacturing has no equivalent mandated standard — treat it as best practice there.

## (E) Proposed sections per document type

**Daily note** — Safety & near-misses (ESSENTIAL; SHE pillar) · Quality events: defects, holds, suspect material (ESSENTIAL) · Delivery/output: target vs actual, orders behind (ESSENTIAL) · Cost/downtime by reason code (ESSENTIAL) · OEE block: planned production time, stop time, total/good/reject count, ideal cycle time (ESSENTIAL if OEE is tracked) · Abnormality & andon log: time, machine, symptom, immediate action, still open? (ESSENTIAL) · Work done (ESSENTIAL) · Tasks that appeared — countermeasure, owner, due (ESSENTIAL) · Escalations to the next tier (ESSENTIAL) · Handover to the next shift (ESSENTIAL) · Meetings (OPTIONAL) · Documents faced (OPTIONAL) · Gemba observations (OPTIONAL) · 5S/audit score (OPTIONAL) · Kaizen ideas captured (OPTIONAL) · Filed into (OPTIONAL index).

**Shift-handover note** — Date/shift/outgoing and incoming names (ESSENTIAL) · Equipment state: running / isolated / degraded (ESSENTIAL) · Open work orders, in-progress maintenance and permit status (ESSENTIAL — HSE's highest-risk category) · Abnormal conditions, temporary changes, overrides (ESSENTIAL) · Quality status: holds, quarantined batches (ESSENTIAL) · Production status: orders complete/behind, WIP location (ESSENTIAL) · Outstanding actions with owner and due (ESSENTIAL) · Verbal confirmation + cross-check signature (ESSENTIAL) · Next-shift priorities (OPTIONAL).

**Task page** — Problem statement / what (ESSENTIAL) · Why it matters, linked to an SQCDP pillar or a loss category (ESSENTIAL) · OEE factor or loss code affected (OPTIONAL) · Owner + due date (ESSENTIAL) · Next action (ESSENTIAL) · Done when — acceptance/verification criteria (ESSENTIAL) · PDCA stage and status (ESSENTIAL) · Root cause / 5-why notes (OPTIONAL) · Standard to update on completion (ESSENTIAL for kaizen) · Notes/history (OPTIONAL).

**Meeting page** — Tier and cadence + attendees (ESSENTIAL) · Metrics reviewed: SQCDP actual vs target, OEE A/P/Q (ESSENTIAL) · Decisions with owner and date (ESSENTIAL) · Action items with owner and due (ESSENTIAL) · Issues escalated to the next tier, to whom (ESSENTIAL) · Context / prior period (OPTIONAL) · Kaizen ideas raised (OPTIONAL) · Next review date (OPTIONAL).

**SOP/procedure page** — Purpose & scope (ESSENTIAL) · When it runs / trigger (ESSENTIAL) · Who: roles + required training (ESSENTIAL) · Inputs: materials, information, permits (ESSENTIAL) · Steps / work sequence (ESSENTIAL) · Takt time, cycle time, standard WIP (ESSENTIAL for standardized work) · Checks and gotchas: quality and safety points (ESSENTIAL) · Abnormality response: stop rule, andon, who responds (ESSENTIAL) · Escalate when (ESSENTIAL) · Output and records produced (ESSENTIAL) · Version, revision date, last kaizen update (ESSENTIAL) · Related standards (OPTIONAL).

## (F) Terminology that needs a precise definition

- **OEE** — A × P × Q over Planned Production Time (ISO 22400-2 / Nakajima). **TEEP** = OEE × Utilization, over All Time ([oee.com](https://www.oee.com/teep/)). **OAE (Overall Asset Effectiveness)** — *not* standardised by ISO or JIPM; vendors define it differently (asset utilisation × OEE, or OEE across a fleet). **OLE (Overall Labor Effectiveness)** for manual processes ([oee.com FAQ](https://www.oee.com/faq)). Pick one and define it on the page.
- **Planned Production Time vs All Time vs loading time** — same concept, three names across sources; ISO 22400 uses its own KPI element names.
- **Downtime vs planned stop** — oee.com counts changeover as an Availability loss (a "planned stop") *inside* OEE; JIPM classifies setup/changeover as its own loss category. Both are defensible; state the convention used.
- **Abnormality vs defect vs failure/breakdown** — abnormality = any deviation from standard (andon signals these); defect = output non-conformance; breakdown has a *threshold* that differs by school (>5–10 min at JIPM/JMAC; any stop long enough to attach a reason at oee.com). Fix the threshold in the SOP.
- **Scrap vs rework vs yield vs FPY** — OEE Quality uses FPY: rework counts as a loss even if recovered.
- **Ideal cycle time / nameplate capacity / design speed** — must be one agreed fixed value; Performance is meaningless without it.
- **Loss vs waste** — 16 TPM losses (equipment / labour / unit-cost) vs the 7 Lean wastes; separate code sets.
- **Countermeasure vs kaizen** — a countermeasure restores the standard; kaizen raises it.
- **Andon** — the *signal*, not the board or the meeting.
- **5S score** — no standard scale; define the scale, frequency and auditor.
- **SQCDP letters and tier numbers** — organisation-specific; define both in the vault.

## Follow-up work in this repository

The section lists above are implemented as vault templates and reference pages, tracked separately:

| Issue | Work |
|---|---|
| [#19](https://github.com/phamtruonghung/webobsidian/issues/19) | Daily note template |
| [#20](https://github.com/phamtruonghung/webobsidian/issues/20) | Shift-handover note template |
| [#21](https://github.com/phamtruonghung/webobsidian/issues/21) | Task page template |
| [#22](https://github.com/phamtruonghung/webobsidian/issues/22) | Meeting page template |
| [#23](https://github.com/phamtruonghung/webobsidian/issues/23) | SOP / procedure page template |
| [#24](https://github.com/phamtruonghung/webobsidian/issues/24) | Terminology glossary |
| [#25](https://github.com/phamtruonghung/webobsidian/issues/25) | Wiki reference pages: pillars, 16 losses, OEE factors and benchmarks |

Each issue carries the same ESSENTIAL/OPTIONAL classification used in section (E), its acceptance criteria, and the source list.
