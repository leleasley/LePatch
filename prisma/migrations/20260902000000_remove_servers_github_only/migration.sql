-- Drop server/agent/host tables (LePatch is now GitHub release tracking only).
-- Existing agents should be uninstalled from their hosts; see docs/agent-uninstall.md.
DROP TABLE IF EXISTS "ServerTag" CASCADE;
DROP TABLE IF EXISTS "Tag" CASCADE;
DROP TABLE IF EXISTS "DismissedFailedPackage" CASCADE;
DROP TABLE IF EXISTS "AgentCapability" CASCADE;
DROP TABLE IF EXISTS "AgentLog" CASCADE;
DROP TABLE IF EXISTS "ServerAlertCooldown" CASCADE;
DROP TABLE IF EXISTS "AlertHistory" CASCADE;
DROP TABLE IF EXISTS "ServerAlertConfig" CASCADE;
DROP TABLE IF EXISTS "ServerMetric" CASCADE;
DROP TABLE IF EXISTS "PendingRestart" CASCADE;
DROP TABLE IF EXISTS "AgentCommand" CASCADE;
DROP TABLE IF EXISTS "UpdateJob" CASCADE;
DROP TABLE IF EXISTS "ServerScan" CASCADE;
DROP TABLE IF EXISTS "PackageDependency" CASCADE;
DROP TABLE IF EXISTS "UpdateProposal" CASCADE;
DROP TABLE IF EXISTS "PackageDaemonMapping" CASCADE;
DROP TABLE IF EXISTS "MaintenanceWindow" CASCADE;
DROP TABLE IF EXISTS "ServerPackage" CASCADE;
DROP TABLE IF EXISTS "RolloutGroup" CASCADE;
DROP TABLE IF EXISTS "AdbDevice" CASCADE;
DROP TABLE IF EXISTS "SavedSubnet" CASCADE;
DROP TABLE IF EXISTS "Server" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "ServerStatus";
DROP TYPE IF EXISTS "ScanStatus";
DROP TYPE IF EXISTS "UpdateJobStatus";
DROP TYPE IF EXISTS "AgentCommandStatus";
DROP TYPE IF EXISTS "PendingRestartStatus";
DROP TYPE IF EXISTS "ProposalStatus";
DROP TYPE IF EXISTS "DayOfWeek";
DROP TYPE IF EXISTS "PackageManager";
