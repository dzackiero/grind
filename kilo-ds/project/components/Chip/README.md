# Chip
Type chips, tag squares and dots carry the workout colour system.

Add a type class (`t-easy`, `t-tempo`, `t-intervals`, `t-hills`, `t-long`, `t-race`, `t-strength`, `t-recovery`) to any of:
- `.k-chip--type`: filled chip, text in `on-type`.
- `.k-tag`: 14px square used in lists (plan weeks, calendar). `.k-tag--split` marks a day with strength plus a run.
- `.k-dot`: 6px dot under week-strip days. Dots use the `-mark` tokens so they stay visible on the light background.

`.k-chip--done` marks a completed workout. Never use a type colour for anything except its workout type.
