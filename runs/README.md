# Run records

Written by `python3 -m quantlab backtest`. One folder per config id. Each run makes three files:
`<UTC stamp>-<config hash 8>.json` (the full record), `.md` (the verdict report) and `.sha256`.
`INDEX.csv` lists every run in order and is the trial count.

Never edit or delete these files. `python3 -m quantlab verify <record.json>` detects changes.
A changed config is a new id, so its runs sit next to the old ones, not instead of them.
