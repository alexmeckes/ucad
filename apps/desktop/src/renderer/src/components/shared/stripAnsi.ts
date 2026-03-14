/**
 * Comprehensive terminal output cleaner.
 * Handles ANSI escape codes, cursor movement, TUI chrome, and noise filtering.
 */

/**
 * Strip all ANSI escape sequences from text.
 * Cursor-forward movements (\e[nC) are replaced with spaces to preserve word boundaries.
 */
export function stripAnsi(text: string): string {
  let result = text;

  // 1. Remove OSC sequences (title changes, hyperlinks, etc.)
  // eslint-disable-next-line no-control-regex
  result = result.replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, "");

  // 2. Remove DCS, APC, PM, SOS string sequences
  // eslint-disable-next-line no-control-regex
  result = result.replace(/\x1b[P_^X][\s\S]*?(?:\x1b\\)/g, "");

  // 3. Replace cursor-forward (\e[nC) with spaces to preserve word spacing
  // eslint-disable-next-line no-control-regex
  result = result.replace(/\x1b\[(\d*)C/g, (_, n) => " ".repeat(parseInt(n) || 1));

  // 4. Remove all CSI sequences (\e[...final_byte)
  // eslint-disable-next-line no-control-regex
  result = result.replace(/\x1b\[[\d;?]*[A-Za-z~]/g, "");

  // 4b. Catch remaining CSI with intermediate bytes (less common)
  // eslint-disable-next-line no-control-regex
  result = result.replace(/\x1b\[[^\x1b]*?[A-Za-z@~`]/g, "");

  // 5. Remove simple escape sequences (ESC + optional intermediates + final)
  // eslint-disable-next-line no-control-regex
  result = result.replace(/\x1b[\x20-\x2f]*[\x30-\x7e]/g, "");

  // 6. Remove any remaining lone ESC characters
  // eslint-disable-next-line no-control-regex
  result = result.replace(/\x1b/g, "");

  // 7. Remove C1 control characters (0x80-0x9f)
  // eslint-disable-next-line no-control-regex
  result = result.replace(/[\x80-\x9f]/g, "");

  // 8. Remove remaining control characters except \n, \t, \r
  // eslint-disable-next-line no-control-regex
  result = result.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");

  // 9. Normalize line endings
  result = result.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  return result;
}

/**
 * Patterns matching TUI chrome/noise lines that should be filtered out.
 */
const TUI_NOISE_PATTERNS: RegExp[] = [
  // Box-drawing characters only (Unicode borders, separators)
  /^[\s─│╭╮╰╯┌┐└┘├┤┬┴┼━┃┏┓┗┛┣┫┳┻╋═║╔╗╚╝╠╣╦╩╬]+$/,
  // Block/shade characters (ASCII art logos)
  /^[\s▐▌▛▜▝▘█▀▄░▒▓■□▪▫●○]+$/,
  // Claude Code version header
  /Claude\s+Code\s+v[\d.]/i,
  // MCP server status messages
  /^\d+\s*MCP\s*server/i,
  // IDE extension messages
  /^IDE\s*extension\s*install/i,
  // Keyboard hints from TUI status bar
  /ctrl\+\w+\s+to\s+edit/i,
  /Space\s+to\s+select.*Enter\s+to\s+confirm/i,
  /Esc\s+to\s+reject/i,
  // Pure symbol lines (no word characters at all)
  /^[\s✔✳✓⏎·•→←↑↓★☆♦]+$/,
  // Lines that are ONLY dashes or equals (separator lines)
  /^[\s\-=]+$/,
  // Checking for updates (CLI startup noise)
  /^Checking\s+for\s+updates\s*$/i,
];

/**
 * Check if a line is TUI noise that should be filtered out.
 */
function isTuiNoise(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  // Very short lines (1-2 non-word chars) are usually TUI artifacts
  if (trimmed.length <= 2 && !/\w/.test(trimmed)) return true;
  return TUI_NOISE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Clean terminal output: strip ANSI codes, filter TUI chrome, normalize whitespace.
 * Returns clean, human-readable text or empty string if nothing meaningful remains.
 */
export function cleanTerminalOutput(text: string): string {
  // Step 1: Strip ANSI escape sequences
  let result = stripAnsi(text);

  // Step 2: Normalize whitespace within lines (collapse runs, trim each line)
  result = result
    .split("\n")
    .map((line) => line.replace(/\t/g, "  ").replace(/ {2,}/g, " ").trim())
    .join("\n");

  // Step 3: Filter out TUI noise lines
  result = result
    .split("\n")
    .filter((line) => !isTuiNoise(line))
    .join("\n");

  // Step 4: Collapse excessive blank lines and trim
  result = result.replace(/\n{3,}/g, "\n\n").trim();

  return result;
}

/**
 * Remove the echo of user input from the beginning of terminal output.
 * PTY echoes back what the user typed, which creates duplicate content.
 */
export function stripUserEcho(text: string, userInput: string): string {
  const echo = userInput.trim();
  if (!echo || !text) return text;

  const lines = text.split("\n");

  // Check if first non-empty line is the echo
  const firstIdx = lines.findIndex((l) => l.trim().length > 0);
  if (firstIdx >= 0 && lines[firstIdx].trim() === echo) {
    return lines.slice(firstIdx + 1).join("\n").trim();
  }

  // Also handle case where text starts with the echo directly
  if (text.startsWith(echo)) {
    return text.slice(echo.length).trim();
  }

  return text;
}
