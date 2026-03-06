# Extract stallings script

Extracts constant data from stallings for use in testgemeente. Replaces source StallingsID (e.g. `3500_005` = postcode 3500, index 005) with target (e.g. `9933_001`).

## Usage

```bash
# Extract and print to stdout
npx tsx scripts/extract-stallings.ts

# Use custom config
npx tsx scripts/extract-stallings.ts --config path/to/config.json

# Write to generated file
npx tsx scripts/extract-stallings.ts --output src/data/stalling-data-by-target.generated.ts
```

## Config format

`scripts/extract-stallings-config.json`:

```json
{
  "stallingsCount": 7,
  "stallings": [
    { "stallingID": "uuid-or-3500_005", "newstallingname": "9933_001", "name": "API Betaalde Stalling" },
    { "stallingID": "...", "newstallingname": "9933_002", "name": "API Buurtstalling" }
  ]
}
```

- `stallingsCount`: total number of stallings (default 7). Missing entries are padded with defaults.
- `stallingID`: source – fietsenstallingen.ID (UUID) or StallingsID (postcode_index)
- `newstallingname`: target stallingsId (postcode_index like 9933_001)
- `name`: display name. Title becomes `{newstallingname} - {name}` (e.g. "9933_001 - API Betaalde Stalling")

Legacy array format is still supported.
