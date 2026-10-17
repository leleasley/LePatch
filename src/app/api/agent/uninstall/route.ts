import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requestIp } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { handleApiError } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * One-time cleanup helper for hosts that still run the retired LePatch Go agent.
 * LePatch no longer manages servers — run the printed commands on each former
 * agent host to remove the binary, systemd unit, and config. No re-pairing or
 * server record is needed afterwards.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin();
    const script = `#!/bin/sh
# LePatch agent uninstall (one-time cleanup — LePatch no longer manages servers)
set -eu
echo "Stopping lepatch-agent..."
sudo systemctl disable --now lepatch-agent 2>/dev/null || true
echo "Removing systemd unit..."
sudo rm -f /etc/systemd/system/lepatch-agent.service
sudo systemctl daemon-reload 2>/dev/null || true
echo "Removing binary and config..."
sudo rm -f /usr/local/bin/lepatch-agent
sudo rm -rf /etc/lepatch-agent /var/lib/lepatch-agent
echo "LePatch agent uninstalled."
`;

    createAuditLog({
      userId: session.id,
      action: "agent.uninstall_script_served",
      target: "agent-uninstall",
      ipAddress: requestIp(request),
    }).catch(() => {});

    return new NextResponse(script, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        // Never let this be rendered or cached as a document.
        "Content-Disposition": "attachment; filename=lepatch-agent-uninstall.sh",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}