const isDev = process.env.NODE_ENV === "development";

function serializeArgs(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (arg instanceof Error) {
      return { message: arg.message, stack: arg.stack, name: arg.name };
    }
    return arg;
  });
}

export const logger = {
  info: (message: string, ...args: unknown[]) => {
    const entry = JSON.stringify({ level: "info", message, timestamp: new Date().toISOString(), ...(args.length ? { data: serializeArgs(args) } : {}) });
    console.log(entry);
  },
  error: (message: string, ...args: unknown[]) => {
    const entry = JSON.stringify({ level: "error", message, timestamp: new Date().toISOString(), ...(args.length ? { data: serializeArgs(args) } : {}) });
    console.error(entry);
  },
  warn: (message: string, ...args: unknown[]) => {
    const entry = JSON.stringify({ level: "warn", message, timestamp: new Date().toISOString(), ...(args.length ? { data: serializeArgs(args) } : {}) });
    console.warn(entry);
  },
  debug: (message: string, ...args: unknown[]) => {
    if (isDev) {
      const entry = JSON.stringify({ level: "debug", message, timestamp: new Date().toISOString(), ...(args.length ? { data: serializeArgs(args) } : {}) });
      console.debug(entry);
    }
  },
};
