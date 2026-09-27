/**
 * Keep the API reply easy to render in a plain HarmonyOS text component.
 * JSON serialization will still escape real line breaks as `\n` on the wire;
 * clients should parse JSON before displaying this value.
 */
export function normalizeReply(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\([*_`])/g, "$1")
    .replace(/\*\*([\s\S]*?)\*\*/g, "$1")
    .replace(/__([\s\S]*?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
