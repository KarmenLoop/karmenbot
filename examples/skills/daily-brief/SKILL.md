# Daily brief

Official example skill. Read-only ask steps only — no shell, network, or file writes. Safe to install and scan.

## Steps

1. Greet the user and confirm today's focus in one short sentence (ask only; do not invent calendar events).
2. Ask whether they want a reminder list for: priorities, waiting-on replies, and personal errands.
3. If they share three bullets, restate them as a numbered brief and stop — do not create files or send messages.
4. Suggest `karmenbot memory journal add "…"` if they want to keep a note locally (they run it themselves).

## Notes

All `permissions` are false. Use this pack as a template for other read-only playbooks.
