# WhiskayBot 2.4.0 — RPG Gacha and shared inventory metadata

- Added a testable gacha engine with SSR/SR/R rates, 50-pull hard pity, single and ten-pull banners, and spirit collection rewards.
- Added a 24-hour daily reward of 40 Aether Gems.
- Duplicate spirit drops convert into rarity-scaled Spirit Shards.
- Sync payload now includes Gacha state, Aether Gems, and Spirit Shards for the website inventory dashboard.
- Commands: `gacha rates`, `gacha summon 1`, `gacha summon 10`, `gacha daily`, `gacha history`, `gacha collection`.
- Verification: `npm test` and JavaScript syntax checks pass.
