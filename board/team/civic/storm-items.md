# The Storm items civic takes (plan)

From data.b@PrompTugal.dinis's list (PrompTugal__News__Data `board/team/data/storm-handoff.md`, read 18 November 2026, 14:00 UTC), relayed by conductor.b@PrompTugal.dinis, under Dinis's guidance of 18 November 08:50 ("lose nothing from Storm"; "if some of those things need to move into one of the other sub-sites ... that's fine"). The list is a proposal; these are civic.b@'s choices. **Proposal, not yet built.**

Rules carried over: the Storm repository (PrompTugal__News__Storm-Charles@fdac6ed) stays frozen as the record; data is read from https://data.promptugal.news/api/v1/storm/charles/ rather than copied; nothing that names private people (media watch, social, evidence) moves; no third-party scripts (this site's gate refuses them).

| # | Item | Civic takes it? | Why, and how |
|---|---|---|---|
| 1 | The incident: timeline, decisions, headline | Yes, first | Public decisions by public bodies, who decided what and when: the bureaucracy in a crisis. One page, `/cases/storm-charles/`, from the archived incident JSON. |
| 2 | Decisions: flow, lead times, days, state (viz) | Yes, with 1 | SVG, no libraries; reads `decisions/graph.json` from the data site. |
| 3 | Guide for readers: Lisbon, media, stranded | Yes, the stranded and Lisbon parts | "Which office does what" in an emergency, beside `/services/which-office/`. Re-check each official link and date it again; the media part stays frozen if it names people. |
| 4 | Timelines: lanes, known-when, lag, story (viz) | Later | Needs the graph tables and the media file, neither archived yet: ask data.b@. |
| 5 | Incident dashboard (viz) | Later, merged into 1 | Overlaps 1 and 2. |
| 6 | Stories: claims with supports (7), story kit | Read first, then decide | Each claim must keep its source and date; anything resting on people's posts stays frozen. |
| 7 | Entities (267 files) | Only public bodies and decisions | Agents, decisions, places and public bodies; outlets by name only as public organisations; no person without consent. |
| 8 | Question-first graph, ontology, lead times | Ontology and lead times only | `engine.js` loads 3d-force-graph and three from another host: refused by this site's gate. The two self-contained SVGs can move. |
| 9 | Wikipedia pages on the storm (viz) | No: leave with data.b@ | Not civic; offered back. |
| 10 | Wikipedia and Wikidata reader (collector) | No: data.b@ owns collectors | As the five-sites brief says. |
| 11 | Graph, tables, ontology, queries (dataset) | Read from the data site | Ask data.b@ to archive it there (not in the archive manifest yet). |

Order: 1 and 2 at the next wake, then 3, then 7 and 8, then 6. Asks for data.b@ (through conductor.b@): archive `data/graph/` (item 11) and the media-free tables that item 4 needs.
