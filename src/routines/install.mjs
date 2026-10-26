import os from "node:os";
import path from "node:path";

/** Print-ready snippets so the owner can wire OS schedulers. No auto-install. */
export function installSnippets({ bin = "karmenbot", home = os.homedir() } = {}) {
  const tick = `${bin} routine tick`;
  const launchAgent = path.join(home, "Library/LaunchAgents/com.karmenbot.routines.plist");
  return {
    cron: `# user crontab — every 5 minutes\n*/5 * * * * ${tick} >>${path.join(home, ".karmenbot/routines/tick.log")} 2>&1`,
    launchd: `<!-- ${launchAgent} -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.karmenbot.routines</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string><string>-lc</string><string>${tick}</string>
  </array>
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><true/>
</dict></plist>
# load: launchctl load ${launchAgent}`,
    systemd: `# ~/.config/systemd/user/karmenbot-routines.service
[Unit]
Description=karmenbot routine tick
[Service]
Type=oneshot
ExecStart=/bin/bash -lc '${tick}'

# ~/.config/systemd/user/karmenbot-routines.timer
[Unit]
Description=karmenbot routine tick every 5 minutes
[Timer]
OnBootSec=2m
OnUnitActiveSec=5m
Persistent=true
[Install]
WantedBy=timers.target

# systemctl --user enable --now karmenbot-routines.timer`,
  };
}
