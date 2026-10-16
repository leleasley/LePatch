# Agent Uninstall (one-time cleanup)

LePatch no longer manages servers or ships a remote agent. If you previously
paired servers, the Go agent binary may still be running on those hosts.

## Remove the agent from a former host

Run this on each host (as a user with sudo):

```sh
curl -fsSL https://your-lepatch-host/api/agent/uninstall | sh
```

(You must be signed in as an admin in your browser session for the download;
alternatively copy the commands from that endpoint.)

What it does:

1. `systemctl disable --now lepatch-agent`
2. Removes `/etc/systemd/system/lepatch-agent.service` + `daemon-reload`
3. Removes `/usr/local/bin/lepatch-agent`
4. Removes `/etc/lepatch-agent` and `/var/lib/lepatch-agent`

No re-pairing or server cleanup inside LePatch is needed — server records,
scan history, and agent commands were removed by the
`20260902000000_remove_servers_github_only` migration.
