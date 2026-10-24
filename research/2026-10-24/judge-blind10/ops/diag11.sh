#!/bin/bash
# vm11 job, read-only diagnostic after final_health11.sh showed voicelab and vp-stage-runtime active since 06:25:49 UTC
# (they had been up since 2026-10-22 06:48:39 and 2026-10-24 04:22:59) and vp-stage-control with 1 restart at 06:25:52,
# plus 13 control error lines since the 04:22:59 deploy. Finds who restarted them. Changes nothing. Error lines are cut
# to 160 characters and scrubbed of anything shaped like a key, token or password before printing.
S=/opt/vp-stage
scrub() { sed -E 's/(key|token|secret|pass(word)?|sig|authorization|bearer)([=: "]+)[^ ,"&]+/\1\2<scrubbed>/Ig' | cut -c1-160; }
echo "== $(date -u)"; echo "booted: $(uptime -s) (uptime $(uptime -p))"
echo "== systemd and package activity 06:24:30-06:27:00 UTC"
journalctl --since '2026-10-24 06:24:30' --until '2026-10-24 06:27:00' --no-pager -o short-iso | grep -viE 'vp-stage-(runtime|control)\[|voicelab\[' | scrub | head -60
echo "== unit-level lines for the three services 06:24:30-06:27:00"
journalctl -u voicelab -u vp-stage-runtime -u vp-stage-control --since '2026-10-24 06:24:30' --until '2026-10-24 06:27:00' --no-pager -o short-iso | grep -E 'systemd\[1\]' | scrub | head -30
echo "== apt / unattended-upgrades / needrestart today"
grep -h "2026-10-24" /var/log/apt/history.log 2>/dev/null | head -10; tail -40 /var/log/apt/history.log 2>/dev/null | grep -E '^(Start-Date|Commandline|Upgrade|End-Date)' | tail -12 | cut -c1-200
ls -la --time-style=full-iso /var/log/unattended-upgrades/ 2>/dev/null | tail -5
grep -h "2026-10-24 06:2" /var/log/unattended-upgrades/unattended-upgrades.log 2>/dev/null | cut -c1-200 | tail -15
echo "== logins and sudo 05:50-06:40"
journalctl --since '2026-10-24 05:50' --until '2026-10-24 06:40' --no-pager -o short-iso -t sshd -t sudo -t systemd-logind 2>/dev/null | scrub | head -20
echo "== control error lines since the 04:22:59 deploy (cut, scrubbed)"
journalctl -u vp-stage-control --since '2026-10-24 04:22:59' --no-pager -o short-iso | grep -iE 'error|traceback' | scrub | head -20
echo "== runtime error lines since 06:25:00"
journalctl -u vp-stage-runtime --since '2026-10-24 06:25:00' --no-pager -o short-iso | grep -ciE 'error|traceback'
echo "== lab error lines since 06:25:00: $(journalctl -u voicelab --since '2026-10-24 06:25:00' --no-pager | grep -ciE 'error|traceback')"
systemctl show voicelab vp-stage-runtime vp-stage-control -p Id -p ActiveEnterTimestamp -p NRestarts -p ExecMainStartTimestamp
exit 0
