// Shared by the composer (Enter) and the Worker (AI split): list markers at the start of a line.
// Covers ・ • ● ○ ◦ ▪ ■ □ → > (and - * + only when followed by a space, so "-5度" survives),
// "1." "1)" "1、" (but not "1.5kg"), "(1)" "（1）" "①", and Markdown checkboxes "- [ ]" / "- [x]".
const BULLET =
  /^\s*(?:(?:[-*+・•●○◦▪■□☐☑✓✔→>]\s*)?\[[ xX✓]?\]\s*|[-*+](?=\s)\s*|[・•●○◦▪■□☐☑✓✔→>]+\s*|\d{1,3}\s*[.)．、）](?!\d)\s*|[（(]\s*\d{1,3}\s*[)）]\s*|[①-⑳]\s*)/;

/** True when the line starts with a list marker. */
export const isBulleted = (line: string) => BULLET.test(line) && line.replace(BULLET, '').trim().length > 0;

/** Remove the list marker from the start of a line. */
export const stripBullet = (line: string) => line.replace(BULLET, '').trim();
