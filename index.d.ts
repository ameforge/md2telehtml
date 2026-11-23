/** Telegram HTML parts of at most `limit` characters, for parse_mode "HTML". */
export function toTelegramHtml(
  markdown: string,
  options?: {limit?: number},
): string[];
