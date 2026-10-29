# Stage 36 — Audit actual Experimental-Bell upload against Whiskay Bot

Date: 2026-10-29. Uploaded source archive SHA-256: `51ad953c96f5e9ee1ec30c35d58abe4d6131c006ac5332935e0e77468aa68cc5`. Primary source: user-uploaded `Experimental-Bell-master.zip` (snapshot dated 2026-09-05). Whiskay baseline: workspace `whiskay-bot`, package version 2.22.0. This report is based on file-level source inspection; it does not assert that an untested or only partially mapped feature is complete.

## Findings from the uploaded archive

The archive contains 18 `helpers/Events/*.js` modules and 9 other helper modules, plus `machine/werewolf.js`, `machine/chess.js`, and additional machine services. `werewolf.js` in Events depends on the separate machine engine and includes `create`, `join`, `start`, Mayor voting, day voting, leave/delete/player/guide; private role actions route through a `wwpc` companion event. The machine engine contains role assignment, kill/protect/heal/poison/inspection, day/night timers, vote tally, traitor activation, and victory detection.

## Whiskay baseline confirmed in source

- Plugin system is `src/core/PluginManager.js` (atomic plugin-map swap) and `src/core/CommandHandler.js` (central command execution and policy gates).
- Interactive messages are handled through `src/core/serializer.js` and `src/core/serializer-compat.cjs`; avoid source-specific WhatsApp payload builders without using the adapter.
- Existing plugins include group moderation/safety, jadibot management, AI chat, downloader and YouTube, sticker-maker, RPG economy/guild/gacha/crafting/trade/daily/shop, chess, Tic-Tac-Toe, pet, slot and truth/dare.
- XP uses `src/lib/leveling.js`, separately for enabled group message XP and successfully executed command XP; `src/handlers/message.js` adds message XP only when group leveling is enabled.
- No pre-existing Werewolf plugin was found in `src/plugins` before this revision.

## Command-family parity matrix

| Experimental-Bell file | Feature family inferred from source and readme | Whiskay observed baseline | Stage 36 action/status |
|---|---|---|---|
| `about.js` | help/about/status | `src/plugins/tools/info.js`, menu | Existing; command-level semantic diff still required |
| `ai.js` | AI, vision/media prompts, provider connectors | `src/plugins/tools/ai-chat.js`, `imagine.js` | Partial; map individual provider and multimodal commands |
| `converter.js` | sticker, audio/video/text conversion | sticker-maker and media plugins | Partial; inventory every converter and dependency |
| `downloader.js` | TikTok, Instagram, YouTube and other providers | dedicated downloader plugins and YouTube plugin | Partial; parity by provider still required |
| `game.js` | mini games and game routing | chess, Tic-Tac-Toe, slots, truth/dare, pet | Partial; Werewolf is new in this revision, other source games remain |
| `group.js` | group admin, welcome and moderation | group-moderation, group-safety, group-tools | Partial; check every command and permission guard |
| `maker.js` | sticker/image/meme makers | sticker-maker, meme, imagine | Partial; provider and style parity gap |
| `others.js` | misc utilities, AFK/runtime/info etc. | assorted general/tools/owner plugins | Gap audit required per command |
| `owner.js` | owner tooling, config, backups, updater | owner plugin set and ops center | Partial; dangerous commands require explicit guard/review |
| `relationship.js` | social / relationship / interaction features | anonymous, menfess, truth/dare and engagement | Partial; individual command inventory required |
| `reloadevents.js` | event reload | hotreload/reload/sourcereload | Existing mechanisms; registry binding is not blanket auto-enabled |
| `rpg.js` | RPG adventure and economy | dedicated RPG plugins and web sync | Partial; compare RPG rules/effects, don't overwrite Whiskay economy |
| `search.js` | search and scraping | anime/search, GitHub, YouTube, scrape tools | Partial; provider-specific gaps remain |
| `tools.js` | utility, OCR, enhancers, web tools | calculator, scrape, info, weather/translate etc. | Partial; command-level comparison remains |
| `tts.js` | text-to-speech | no dedicated general TTS plugin confirmed in baseline | Gap; requires provider/license/config review |
| `werewolf.js` + `machine/werewolf.js` | multiplayer social deduction game | absent from baseline before stage revision | New implementation added; see limitations |
| `wwpc.js` | private Werewolf role actions | absent from baseline before stage revision | New adapter added; room routing/DM live test required |

## Other helper modules

| File | Responsibility | Whiskay comparison / recommendation |
|---|---|---|
| `client.js` | socket/message convenience | retain Whiskay serializer facade as the canonical adapter |
| `eventGame.js` | game event coordination | new Werewolf engine is state-isolated; existing games remain canonical |
| `events.js` | event filtering/dispatch | `src/core/event-registry.js` validates filters and bounds recursive emission |
| `initialize.js` | setup and lifecycle | Bot lifecycle/PluginManager remains canonical; no parallel initializer |
| `interactive.js` | AI-to-event routing | keep allow-listed routing; do not execute sensitive commands from AI guesses |
| `jadibot.js` | sub-bot session lifecycle | Whiskay `src/plugins/general/jadibot.js`; compare lifecycle, encryption, session isolation |
| `reaction.js` | reactions | add only through the compatible socket facade |
| `stubTypeMsg.js` | system stub/type handling | extend serializer only after regression coverage |
| `utils.js` | misc helpers | safe URL/mention/media adapters added in prior stage; avoid duplicate helpers |

## Werewolf implementation in this revision

New files: `src/lib/werewolf-engine.js`, `src/lib/werewolf-store.js`, `src/plugins/games/werewolf.js`, `src/plugins/games/werewolf-private.js`. State is keyed by group and stored in the existing app database; role distribution is sent by private message; the engine includes role definitions, voting, night-action constraints, phase resolution and victory detection. The state is not stored as a process-global game map.

### Explicit limitations (do not mark as complete parity)

- This is a rebuilt MVP, not a verbatim port of the entire ~33 KB event file and ~44 KB engine. It preserves core mechanics but role coverage and phase rules should be expanded and tested.
- The phase is host-driven (`.ww resolve-night`, `.ww resolve-day`), not timer-driven. This avoids detached timers with inconsistent persistence in this first integration.
- The DM `wwpc` routing uses a room ID argument to locate group state; a polished group-to-private room binding and safe game-state lookup UI are still required. The active game roles must be tested across WhatsApp private/group contexts.
- Mayor vote weight and role-specific edge cases need dedicated tests. A `hunt` role action is currently accepted by routing but is not yet applied as an after-death trigger in the resolver. `lycan` inspection alias is represented; traitor conversion is simple and needs balancing tests.
- No live WhatsApp, privacy, timed phase, or multi-client concurrency test was executed.

## Priority findings / what to add next

P0: make `wwpc` room binding reliable without requiring users to remember room IDs; implement day/night deadlines and recovery after restart; enforce group-level host actions and game participant roles; add unit tests for every legal/illegal role action and endgame.
P1: source-command parity JSON for all Events modules; implement TTS after provider review; complete converter/downloader inventories; close commands in `others.js` and `owner.js` after security review.
P2: per-chat feature configuration, localized response catalog coverage, admin audit trail, property tests and WhatsApp interactive regression tests.

## Source command-definition extraction (heuristic)

The following counts only literal `cmd:` declarations found by regex (it will not capture dynamically generated commands or every alias); use as a scanning aid, not a completeness proof.

| File | Bytes | Literal command-list captures | Example captured names |
|---|---:|---:|---|
| `about.js` | 1,646 | 4 | cara, guide, help, panduan |
| `ai.js` | 69,980 | 67 | ai, ai_interactive, aichat, animediff, autoai, babygenerator, bard, bell, bimg2img, bingcreate, bingedit, bingimg, buatanak, checkpointsearch, clay, clayfilter, clayfilters, clearsesichat, cover, covers, dalle3, deepseek, deepseek-r1, edit, ehv, enhancevideo, enlarge, enlarger, faceswap, faceswap-change, faceswap-reset, filter, filters, finding, geminiimage |
| `converter.js` | 33,157 | 28 | 16d, 16daudio, burik, burik_image, burik_video, burikkan, concat, ffmpeg, fixvideo, gabung, gabungmedia, merge, ptv, recodevideo, stems16d, toaudio, togif, toimage, toimg, tomp3, tomp4, toptv, tovideo, tovn, webp2jpg, webp2png, webptojpg, webptopng |
| `downloader.js` | 24,461 | 39 | dlvlink, facebook, facebookdl, fb, fbdl, gitclone, ig, igdl, instagram, instagramdl, mediafire, mediafiredl, pindl, pinterestdl, play, playvn, rednote, renotedl, spodl, spotdl, spotify, tiktok, tiktokaudio, tiktokdl, tiktokvn, tt, ttaudio, ttvn, xiaohongshu, youtube, youtubedl, youtubedownloader, yt, ytdl, ytm4a |
| `game.js` | 92,947 | 24 | asahotak, caklontong, cek, chess, cleargame, dadu, delsesiut, delulartangga, family100, hint, minigame, minigames, nyerah, roll, sos, susunkata, tebakanime, tebakbendera, tebakgambar, tebakjenaka, tebaklirik, tebaktebakan, ulartangga, ut |
| `group.js` | 75,486 | 48 | absen, add, addsewa, afk, antilink, antitoxic, bancmd, blacklist, ceksewa, close, closetime, delsewa, demote, getpp, getppgc, group, hidetag, infogc, infogroup, inviteinfo, jadwalsholat, kick, kurangisewa, linkgc, listsewa, off, on, open, opentime, pinchat, pinpesan, promote, resetlink, schedule, schedules |
| `maker.js` | 13,514 | 37 | bart, bartv, bartvideo, bartvideogenerator, brat, bratgenerator, brathd, bratv, bratvid, bratvideo, bratvideogenerator, bratvidhd, colongstc, colongsticker, colongstiker, emojimix, fake-ngl, iqc, iqc-wa, ngl, pinkgreen, qc, quoted, s, setiker, setikerwm, smeme, sticker, stickermeme, stickerwm, stiker, stikermeme, stikerwm, swm, triggered |
| `others.js` | 59,681 | 20 | d, del, delete, getviewonce, info, jadibot, menu, menureaction, ping, reaction, reactionmenu, rvo, rvome, sc, script, sourcecode, speed, statistic, stats, totalpesan |
| `owner.js` | 128,282 | 80 | addcoowner, addenergy, addlinkgc, addowner, addprem, addpremium, addrespon, adresponse, backup, badword, banned, block, cekapikey, chatadmin, checkupdate, clearsesi, clearsessi, clearsession, csesi, delcmd, delcoowner, deldata, dellinkgc, delowner, delprem, delpremium, delrespon, delresponse, detailticket, detailupdate, dm, getcmd, getdata, getevents, infoticket |
| `relationship.js` | 40,535 | 22 | cas, charge, checkconfess, checkmenfess, claimtrial, confes, confess, confessinfo, freetrial, inventory, menfess, menfessinfo, mmmmmmining, profil, profile, qris, relationship, status, tf, tfenergy, transfer, transferenergy |
| `reloadevents.js` | 319 | 1 | reloadevents |
| `rpg.js` | 56,260 | 26 | beli, berburu, buy, cekdiskon, ceksn, claim, craft, daftar, deldiskon, diskon, diskonlist, fishing, hapusdiskon, heal, hunting, jual, mancing, mining, open, opencrate, register, repair, sell, shop, unreg, upgrade |
| `search.js` | 17,645 | 23 | animesearch, gimage, gimg, gis, googleimage, googleimg, image, lirik, liriksearch, lyrics, pin, pinstick, pinsticker, pinstik, pinstiker, pinterest, pinterestsearch, pinterestvid, pinterestvideo, pinvid, tiktoksearch, ttsearch, ttsr |
| `tools.js` | 19,983 | 46 | ${random}, audio2text, audio2txt, c, catbox, change, colong, compress, enc, encrypt, encryptjs, enhance, getchannelid, getchid, getidsaluran, getsaluranid, getsitekey, hd, hextorgba, image2prompt, imagetoprompt, img2prompt, imgtoprompt, kompres, musicrecognition, musixsearch, objectdetection, rch, remini, removebg, rgbatohex, searchmusic, searchsong, sitekey, sitekeyfinder |
| `tts.js` | 4,272 | 2 | elevenlabs, gtts |
| `werewolf.js` | 32,981 | 1 | ww |
| `wwpc.js` | 6,497 | 1 | wwpc |
