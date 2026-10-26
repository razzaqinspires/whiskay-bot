# Egg sales calculator integration

## Bot commands

- `.telur` — opens the calculator website.
- `.kalkulatortelur` / `.hitungtelur` — aliases.
- `.egghelp` / `.bantuantelur` — explains the whole-egg math.

## Environment

Set `EGG_CALCULATOR_URL` to the exact public HTTPS URL for the separately hosted calculator website:

```env
EGG_CALCULATOR_URL=https://your-calculator-domain.example/
```

The current supplied bot `.env` already has this key configured. Preserve that local value when merging `.env.example`; do not overwrite the private `.env` file when applying the ZIP. The bot plugin validates HTTPS for public hosts and rejects URLs with embedded username/password. `localhost` and `127.0.0.1` are accepted only for local development.

The website is not included in this bot ZIP; the source archive only contains the WhatsApp command integration and tests. Deploy the calculator website independently and set the environment variable to the resulting URL, then restart the bot.

## Calculation rule

For cash `C` and unit price `P` where both are non-negative and `P > 0`:

- `quantity = floor(C / P)`
- `total = quantity * P`
- `change = C - total`
- `shortageForNextEgg = P - change` when `change < P`

Use floor, not round-to-nearest, because a buyer cannot purchase a fraction of an egg. The command's help includes a `Rp10.000 / Rp1.700` example: 5 eggs, total Rp8.500, change Rp1.500.

## Tests

`test/egg-calculator-plugin.test.js` checks:
1. The plugin emits the expected `open_webview` CTA serializer contract.
2. Public HTTP calculator URLs are rejected.
3. Help text explains whole-egg rounding and the example.

Run `node --test test/egg-calculator-plugin.test.js` from the bot root.
