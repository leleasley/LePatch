export const telegramBotCommands = [
  { command: "start", description: "Welcome and capabilities overview", adminOnly: false },
  { command: "link", description: "Link your Telegram account to LePatch", adminOnly: false },
  { command: "help", description: "Show all available commands", adminOnly: false },
  { command: "status", description: "Account info and system overview", adminOnly: false },
  { command: "apps", description: "List watched apps with versions", adminOnly: false },
  { command: "updates", description: "Apps with available updates", adminOnly: false },
  { command: "check", description: "Queue release check for app", adminOnly: true },
  { command: "checkall", description: "Queue checks for all apps", adminOnly: true },
  { command: "unlink", description: "Remove Telegram link", adminOnly: false },
] as const;
