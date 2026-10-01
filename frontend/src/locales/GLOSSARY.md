# Dutch glossary and voice

Archstats in Dutch should read the way a Dutch developer talks and writes in a
team chat, a PR or an architecture doc. It should not read like a dictionary
translation. Dutch developers keep the English word for most technical terms
and use Dutch for everything around them. When a Dutch word would make a
developer stop and translate it back to English in their head, keep the
English word.

## Voice

- Use **je/jouw**, never u. The tone is direct and friendly, as with a colleague.
- Keep sentences short and active, with one idea per sentence. The code is the subject, never the tool:
  write "Deze component verandert vaak", not "Archstats ziet dat…".
- Report prose (readings, template text, prompts) is written for a junior developer. Use plain
  words, lists instead of long chains, and no academic Dutch ("derhalve", "middels", "teneinde",
  "dient te").
- UI labels follow Dutch software conventions. Buttons are infinitives ("Opslaan",
  "Exporteren"). Menu items and headings use sentence case ("Nieuwe groep", not "Nieuwe Groep").
- Treat English nouns as Dutch nouns: "de component", "de commit", "het snapshot", "de branch".
  Plurals follow how developers say them: commits, branches, hotspots, files → bestanden.
- English verbs get Dutch conjugation where developers do that: committen (gecommit),
  refactoren (gerefactord), deployen (gedeployd), scannen (gescand), mergen (gemerged).
- Compounds of an English and a Dutch word take a hyphen: "dependency-regel", "hotspot-score",
  "commit-historie". Compounds of two Dutch words are written as one word: "codebestand".

## Keep in English

These stay English everywhere. Inflect them as Dutch nouns.

| English | Dutch usage |
| --- | --- |
| component, components | component, componenten (de component) |
| commit, commits | commit, commits |
| branch, merge, repo, repository | idem |
| snapshot | snapshot (het snapshot) |
| scan (noun) | scan; verb: scannen |
| workspace | workspace |
| dependency, dependencies | dependency, dependencies |
| import, imports (noun and verb) | import, imports; importeren |
| hotspot, hotspots | idem |
| churn | churn |
| coupling | coupling (in metric names); in prose "koppeling" is fine |
| cycle, cycles | cycle, cycles (the view is "Cycles") |
| tangle, tangles | tangle, tangles |
| lens, lenses | lens, lenses |
| unit, units | unit, units |
| deployable, deployables | idem |
| pipeline, build, deploy, release | idem |
| framework, library, package, module | idem (libraries, packages, modules) |
| treemap, chord, plot, scatter | idem |
| bus factor | bus factor |
| code health | code health |
| main sequence, zone of pain | main sequence, zone of pain |
| entry point | entry point |
| bot, bots | idem |
| query (SQL) | query, queries |
| prompt (AI) | prompt |
| exhibit | exhibit |
| pin (noun/verb) | pin; pinnen |

## Translate

| English | Dutch |
| --- | --- |
| file, files | bestand, bestanden |
| folder, directory | map, mappen |
| line(s) of code | regel(s), regels code |
| rule, rules (dependency rules) | regel, regels; "architectuurregel" where "regel" could mean a line of code |
| finding, findings | bevinding, bevindingen |
| violation | schending |
| group, groups | groep, groepen |
| layer | laag, lagen |
| author, authors | auteur, auteurs |
| people | mensen |
| history | historie |
| overview | overzicht |
| report | rapport |
| evidence | bewijs (de verzameling: "Bewijs") |
| reading (computed paragraph) | analyse |
| template | template |
| settings | instellingen |
| search | zoeken |
| save / cancel / delete / close | opslaan / annuleren / verwijderen / sluiten |
| export / import (a file) | exporteren / importeren |
| copy | kopiëren |
| selection | selectie |
| complexity | complexiteit |
| instability / abstractness | instabiliteit / abstractheid |
| depends on / used by | hangt af van / gebruikt door |
| outgoing / incoming | uitgaand / inkomend |
| matrix | matrix |
| over time | in de tijd |
| changes | wijzigingen |
| activity | activiteit |
| hidden coupling | verborgen koppeling |
| checks | checks |
| metric, metrics | metric, metrics (the view is "Metrics") |
| metric reference | metric-referentie |
| about this snapshot | over dit snapshot |
| SQL console | SQL-console |
| ask (the view) | Vraag |
| production code / tests | productiecode / tests |
| age (of code) | leeftijd |
| owner, ownership | eigenaar, eigenaarschap |
| knowledge | kennis |
| effort | inspanning |
| roles | rollen |

## Never translate

- Placeholders: `{count}`, `{name}` and the rest stay exactly as they are. You may move them
  within the sentence.
- Code and data: metric ids (`codesmells__hotspot_score`), column and table names, SQL, file
  paths, CLI flags, keyboard shortcuts, product names (Archstats, GitHub, Spring, Gradle…).
- Markdown markers: `*emphasis*`, `**bold**`, `` `code` ``, list dashes, blank lines between
  paragraphs.

## Numbers and dates

`t()` and the shared formatters format numbers for Dutch (1.234,5). Do not write numbers into
messages yourself. Units: d (dagen), mnd (maanden), j (jaren). Percentages are written "12%",
without a space, as developers write them.

## View names

Use these names wherever a view is named, in labels, links ("Open Verbindingen") and prose.

| English | Dutch |
| --- | --- |
| Overview | Overzicht |
| Ask | Vraag |
| Metrics | Metrics |
| Hotspots | Hotspots |
| Connections | Verbindingen |
| Dependency matrix | Dependency-matrix |
| Chord | Chord |
| Cycles | Cycles |
| Plotter | Plotter |
| Main sequence | Main sequence |
| Component comparison | Component-vergelijking |
| Files table | Bestandstabel |
| File treemap | Bestands-treemap |
| File dependencies | Bestands-dependencies |
| Authors | Auteurs |
| Activity | Activiteit |
| Churn | Churn |
| Timeline | Tijdlijn |
| Hidden coupling | Verborgen koppeling |
| Folder X-ray | Map X-ray |
| Units | Units |
| Deployables | Deployables |
| Checks | Checks |
| Libraries | Libraries |
| Rules | Regels |
| Changes | Wijzigingen |
| Over time | In de tijd |
| Lenses | Lenses |
| Evidence | Bewijs (the board: bewijsbord) |
| SQL console | SQL-console |
| About this snapshot | Over dit snapshot |
| Metric reference | Metric-referentie |

## Settled in translation

- A stack "floor" is a laag, lagen.
- A cut (in a tangle) stays "cut", "cuts". A level stays "level", "levels".
