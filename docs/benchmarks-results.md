#### memory-search

| Group | Task | ops/sec | mean (ms) | p99 (ms) | samples |
| ----- | ---- | ------: | --------: | -------: | ------: |
| N=100 | knn top-10 | 8,613 | 0.1161 | 0.1534 | 4307 |
| N=1,000 | knn top-10 | 3,560 | 0.2809 | 0.3273 | 1780 |
| N=10,000 | knn top-10 | 287 | 3.4790 | 4.4553 | 231 |

#### agentic-loop

| Group | Task | ops/sec | mean (ms) | p99 (ms) | samples |
| ----- | ---- | ------: | --------: | -------: | ------: |
| schema-prep | sanitize tool schemas (8 tools) | 50,098 | 0.0200 | 0.0341 | 25049 |
| result-handling | truncate large tool result (~10KB) | 22,807 | 0.0438 | 0.0660 | 11404 |
| dispatch | parse + dispatch 4 tasks (mocked) | 455,246 | 0.0022 | 0.0035 | 227623 |

#### dex-routing

| Group | Task | ops/sec | mean (ms) | p99 (ms) | samples |
| ----- | ---- | ------: | --------: | -------: | ------: |
| address-prep | parse + normalise jetton addresses | 228,911 | 0.0044 | 0.0085 | 114456 |
| amount-conversion | amount <-> base units (9 decimals) | 1,090,863 | 0.0009 | 0.0014 | 545432 |

