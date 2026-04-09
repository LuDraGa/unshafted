const COLORS = {
  reset: '\x1b[0m',
  success: '\x1b[32m',
  info: '\x1b[34m',
  error: '\x1b[31m',
  warning: '\x1b[33m',
} as const;

export const colorfulLog = (message: string, type: keyof typeof COLORS = 'info') => {
  console.info(COLORS[type], message);
  console.info(COLORS.reset);
};
