# Barnyard Reaper: working notes

A browser roguelike (three.js r128 from cdnjs, no build step). `./barnyard` serves the game and its tools
on http://localhost:8000 (`tools/serve.py`). Everything tunable lives in `data/*.json`, each file with a
`_help` block that documents its keys; code in `js/` reads it through `js/data.js`.

## Nomenclature: what the words mean

When the user uses one of these words, this is what they mean. Several features were renamed for players
while their ids in code and JSON kept the old names (saved talent files and data use those ids), so the
"In code" column is what to search for.

| Word | Meaning | In code |
|---|---|---|
| **Blessing** | The upgrade you pick every level up (also sold at the workbench) | `data/upgrades.json` "blessings", `G.UPGRADES`, `G.UPG`, `G.pickList`, `G.picks`, `PR.applyUpgrade`, Book tab id `upgrades` |
| **Miracle** (currency) | Got from the **bonfire** at night (one per night); spent on the Miracles | currency id `spoon`: `G.CURRENCIES.spoon`, `G.run.spoons`, `TL.addSpoons`, `talentPoints.spoons`, rules `gain` value `spoons`; icon `sun`. Was "Alien Spoon" (invasions no longer give them) |
| **Miracles** (the talents) | The big talents with no tree, bought with Miracles (panel tab, key Y) | the `"alien"` section of `data/*_talents.json`, `G.CHAR.alien`, panel tab id `alien`, `renderAlien()`, editor mode `alien`. Were "Alien Talents" |
| **Totem of Power** | The currency you spend on talents in the tree, from Altars of Power | currency id `totem`, `G.run.totems` |
| **Talent** | A node of a character's tree (`data/<char>_talents.json`) | `G.talents`, `G.CHAR.tree` |
| **Talent tree builder** | The talent creator, `tools/talents/` | builder **stats** = `G.STATS` (data.js); builder **options** = built-in effects `G.EFFECTS` (data.js, coded in combat/talentfx) or rules (`js/rules.js` TRIGGERS / CONDITIONS / ACTIONS) |
| **Event** | Something that happens at random during a day: Eldritch Gaze, alien invasion, Altar of Power, XP barrel, Unholy Shrine, Shrine (of Mary), Chest; also bosses, rare monsters, ritual, cauldron, The Dark, Mokosh, dungeon stairs | weighted day events: `G.EVENTS` (`stages.json events`, day.js `event()`); scheduled ones: `altars.js`, `chests.js` (chests, barrels, shrines), `mokosh.js`, `dungeon.js` |
| **Embers** | The currency you pick up from the ground (workbench, paid chests, Mokosh) | `essence` everywhere: `G.run.essence`, `essenceTotal`, `PK.ess`, `PK.dropEssence`, stat `essenceGain`, enemies.json `"essence"`, icon `essence` (a small fire), sound `essence`. Were "Essence" |
| **Map** | The look and content of a day's environment: The Farm, The fourth dimension (crash site), The Unexplainable, Eldritch Madness | `stages.json maps[]` (ids `farm`, `crash_site`, `unexplainable`, `madness`), `G.MAPS`, `G.map()`; one map per day |
| **Day** | One fight, 5 minutes (`daySeconds`), on one map | `G.day`, `G.dayT`, `G.DAY_SECONDS` |
| **Stage** / danger stage | The parts of a day, a minute each (Golden Afternoon → Blood Moon) | `G.tier` (this day), `G.danger` (whole run), `stages.json stages[]` |
| **Night** / the pause between days | After the day: monsters crumble, lamps light, the bonfire burns | phase `'camp'` (`G.phase`), `dawn()` in day.js is nightfall, rules trigger id `dawn` = "Night falls", music `camp` |
| **Bonfire** | Burns at night in the middle of the farm; E gives the Miracle and Embers per kill and shows the day's summary; **Pray** is the only way to the next day | `js/bonfire.js`, `stages.json camp.bonfire`, state `'bonfire'` then `'praying'` |
| **Ailments** | Poison and bleeding (damage over time). Statuses are slow, shock, stun, root | `G.DOTS`, `C.poison`, `C.bleed` / `C.addBleed` (bleeds can stack), `G.STATUS` |
| **Implicit** | A weapon type's fixed modifier | `weapons.json implicit`, `G.WEAPON_FX` effects in data.js |
| **Training dummy** / DPS meter | Behind the barn at night; shows your damage per second | day.js `buildCamp`, `DY.dps` |

## Conventions

- Data first: new numbers go in `data/*.json` with a default in `js/data.js` and a line in that file's
  `_help`. New stats go in `G.STATS` (+ `G.STAT_TAGS`), new talent effects in `G.EFFECTS` (+ `G.EFFECT_TAGS`
  and the effect list in `cat_talents.json` `_help`): the talent creator picks both up by itself.
- Renaming something players see: change the words, keep the ids (data files, saved talents and rules
  refer to them), and say what the id now means in a comment and in the table above.
- Talent files are written by the talent creator in `tools/talents/jsonfmt.js` style; edit them through it
  (`node -e` with `require('./tools/talents/jsonfmt.js')`) so a save in the editor makes no stray diff.
- Comments say what the code does in the game's own words; every file starts with a header saying what it
  holds. Lights are made once at start (`world.js`): adding lights later recompiles every material.
- Ailment durations: a duration stat changes how long a poison or bleed lasts but not its total damage.
- No test suite: `node --check js/*.js`, `python3 -m json.tool data/*.json`, and the game itself in headless
  Firefox (see the runtime-testing memory). The Balance Lab is `tools/balance.html`.

## Tools

- `tools/talents/`: the talent creator (talent tree builder). Saves through `tools/serve.py`.
- `tools/balance.html`: the Balance Lab (fights on the real engine, offense only).
- `tools/showcase/`: every model and icon, viewable and downloadable as transparent PNGs (one or a whole
  section as a zip).
