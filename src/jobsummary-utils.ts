/**
 * Utility functions for generating GitHub-friendly Markdown content.
 */

/**
 * Formats a 2D array into a Markdown table.
 */
export function generateMarkdownTable(headers: string[], rows: string[][]): string {
    const headerRow: string = `| ${headers.join(' | ')} |`;
    const separatorRow: string = `| ${headers.map(() => '---').join(' | ')} |`;
    const dataRows: string[] = rows.map((row) => `| ${row.join(' | ')} |`);
    return [headerRow, separatorRow, ...dataRows].join('\n');
}

/**
 * Wraps a string as a collapsible GitHub summary block.
 */
export function wrapInDetailsBlock(title: string, content: string): string {
    return `<details>\n<summary>${title}</summary>\n\n${content}\n\n</details>`;
}

/**
 * Converts an object to a Markdown bullet list.
 */
export function objectToMarkdownList(obj: Record<string, string | number | boolean>): string {
    return Object.entries(obj)
        .map(([key, value]) => `- **${key}**: \`${value}\``)
        .join('\n');
}

/**
 * Creates a summary block for a CLI command and its output.
 */
export function formatCliOutputAsMarkdown(command: string, output: string): string {
    return `### \`${command}\`\n\n\`\`\`bash\n${output}\n\`\`\``;
}
