# ictbot-tests

Public test copy of the ICT Gold Bot engine, used to run its replay tests on GitHub's free runners.
It holds the bot engine, `src/`, the test tools in `tools/` and the replay workflow. It has no keys,
account details or deployment settings, and it doesn't trade: the live bot runs elsewhere.

How the tests work and their pass rules: `tools/replay/RULES.md`. Every run is logged in `tools/replay/VARIANTS.md`.
