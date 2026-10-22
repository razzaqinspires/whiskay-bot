# WhiskayBot — Menu, Profile & Dungeon Upgrade

## What's changed
- `setmenu`: 7 templates (`corporate`, `minimal`, `terminal`, `elegant`, `aurora`, `classic`, `compact`), 3 additional fonts (`italic`, `script`, `circled`), removed Zalgo, independent category-heading visibility, description visibility, widget controls, font-weight controls, borders, spacing, sorting and reset.
- Menu image is attached to the same interactive message as the menu controls. Official menu canvas and official RPG profile canvas now render locally if no public owner image URL is configured. Optional overrides: `MENU_IMAGE_URL` and `RPG_PROFILE_IMAGE_URL`.
- Custom menu image flow supports replying to the setup prompt with an image and caption `.setmenu image save`, or replying to an already-sent image with that command.
- Profile image and profile information/buttons are sent as one interactive message (where the current WhatsApp/Baileys client supports interactive media). Primary actions: Leaderboard, Dashboard and Inventory WebView.
- Leaderboard reads the leveling data for the current chat.
- Dungeon includes a detailed 10-floor data file at `data/dungeon/floors.json`, named locations, monsters, NPC dialogue, hazards, stats, skills, buffs, kill-skill triggers, drops, first-clear rewards, and a Worker Thread forecast estimator.
- Separate Vercel companion app: `vercel-rpg/`. Includes inventory/profile UI, 10-floor web combat prototype, `/api/floors`, `/api/player`, `/api/sync`, and Supabase schema.

## Set menu usage
Use `.setmenu` and choose settings with the embedded list. For images:
1. `Official · Kanvas Menu`: uses `MENU_IMAGE_URL` if valid, otherwise renders a built-in canvas.
2. `Official · Kanvas Profile RPG`: sets the profile card to the generated RPG canvas; it uses `RPG_PROFILE_IMAGE_URL` if valid, otherwise a built-in canvas.
3. `Gambar kustom`: select it, reply to the prompt with an image and caption `.setmenu image save`, or reply to an existing image with `.setmenu image save`.

## Vercel setup
1. Deploy `vercel-rpg/` as a separate Vercel project.
2. Create a Supabase project and run `vercel-rpg/schema.sql`.
3. Set Vercel environment variables `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `BOT_SYNC_TOKEN`. Keep both secrets server-side.
4. In the bot environment, set `DUNGEON_WEBSITE_URL` to the deployed Vercel URL and `DUNGEON_SYNC_TOKEN` to the same secret value as Vercel's `BOT_SYNC_TOKEN`.
5. Restart the bot. Viewing `.profile` and saving RPG player progress triggers best-effort sync to the dashboard. The website URL button includes an opaque hashed player ID rather than the raw WhatsApp JID.

## Important limitations
- The Vercel battle interface is a front-end prototype. It has animated UI and client-side combat actions, but it is not yet authoritative multiplayer combat and does not persist each web turn. Production combat should move turn validation to authenticated server APIs.
- The forecast worker estimates expected turns and incoming damage from current stats; its win percentage/confidence are heuristics, not a guarantee or trained predictive model.
- Audio is not included in this initial web prototype because reliable audio asset licensing, mobile autoplay rules, and 3D asset delivery require dedicated assets and testing. The current scene uses procedural CSS effects rather than a full real-time 3D engine.
