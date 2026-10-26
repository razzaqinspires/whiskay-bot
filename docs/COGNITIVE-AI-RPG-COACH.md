# Cognitive AI & RPG Tactical Coach — 2026-10-26

## Cognitive request handling

`src/cognitive/metacognitive-nexus.js` applies bounded input cleanup, task-shape classification (math, multi-step, conversational), and instructions to check consistency, distinguish assumptions from facts, report relevant uncertainty, and avoid claiming external actions that were not performed. Conversation memory remains short-term and bounded by the existing memory module.

This is a software architecture improvement, not proof of AGI, sentience, or artificial consciousness. A language model can simulate reflective language; that alone does not establish subjective experience or general intelligence.

## RPG Tactical Coach

Use `.rpg coach` (alias subcommand `.rpg strategy`) to receive deterministic advice based on the current player snapshot:

- HP ratio and potion availability;
- gold and rest cost;
- weapon power relative to level;
- current dungeon floor and victory count.

The coach does not mutate Gold, XP, equipment, or HP. Actions remain explicit commands such as `.rpg potion`, `.rpg explore`, `.rpg status`, and `.inventory`. Recommendations are heuristics, not guaranteed battle outcomes.

## Test scope

The regression suite checks policy persistence, only-here mode, reset preserving group safety settings, opt-in toxic filtering, custom phrases, text-flood detection, and plugin command metadata. Live model-provider calls, live WhatsApp groups, and production RPG website integration are not mocked as end-to-end tests here.
