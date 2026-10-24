/** Statement text with image and math markup turned into plain lines. */
export function readableStatement(statement: string): string {
  return statement
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/\$\$([\s\S]+?)\$\$/g, '\n$1\n')
    .replace(/\\\[([\s\S]+?)\\\]/g, '\n$1\n')
    .replace(/\\\(([\s\S]+?)\\\)/g, ' $1 ')
    .replace(/(^|[^\\$])\$([^$\n]+?)\$/g, '$1$2')
    .replace(/```[a-zA-Z0-9]*\n?/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
