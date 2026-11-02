# Verdict: {{config_id}}

| | |
|---|---|
| Config | `{{config_path}}` |
| Config SHA-256 | `{{config_sha256}}` |
| Config first committed | {{config_first_commit}} ({{config_first_commit_date}}) |
| Pre-registered | {{preregistered}} |
| Data source | {{data_source}} |
| Data SHA-256 | `{{data_sha256}}` |
| Data range | {{data_from}} to {{data_to}} |
| Run at (UTC) | {{run_at_utc}} |
| Trial number (all tries so far, incl. this) | {{trial_number}} |

## Verdict

**Historical (backtest) verdict: {{historical_verdict}}**

**Real-money verdict: {{real_money_verdict}}** ({{real_money_reason}})

Allowed outputs are only *Pass*, *Fail* and *Insufficient evidence*. A historical
Pass is never enough for real money: that also needs a forward (demo) Pass on
data recorded after the config was committed, and the owner's explicit decision.

### Pre-registered thresholds and results

{{checks_table}}

### Forward (demo) thresholds, written before the run

{{forward_thresholds}}

## Multiple testing

{{multiple_testing}}

## Results

{{results_table}}

### Out-of-sample yearly returns (net, 1x)

{{yearly_oos}}

### Full-sample yearly returns (net, 1x)

{{yearly_full}}

### Random-entry controls ({{control_count}} runs, matched holding, long only)

{{controls}}

### Costs

{{costs_section}}

## Known limits of this test

{{limits}}

## What would change this verdict?

{{what_would_change}}

## Engineering status

{{engineering_status}}

## Profitability status

{{profitability_status}}
