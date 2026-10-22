# Stage 11 — World Environment

`WorldManager.jsx` now owns smoothly interpolated ambient, directional and hemisphere lighting plus rain particles. `AdventureClient.jsx` passes `worldHour` and current weather into it, and removes duplicate light/rain renderers. Day/night lighting is smoothed per frame; rain uses a capped 180-particle buffer for mobile.

## Test
- `npm run verify:stage11`
- `npm run build`
- On device, switch weather to Rain and watch lighting at dawn, noon, dusk, and night. The existing game clock advances 0.025 hours per second; the lighting eases between states.
