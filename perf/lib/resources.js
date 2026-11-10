import { stripVTControlCharacters } from 'node:util';

// Docker Desktop may repaint stats with ANSI controls even when stdout is piped.
export function parseStatsLine(line) {
  const cleaned = stripVTControlCharacters(line).trim();
  return cleaned ? JSON.parse(cleaned) : null;
}
