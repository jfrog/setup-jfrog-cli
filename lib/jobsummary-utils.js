"use strict";
/**
 * Utility functions for generating GitHub-friendly Markdown content.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateMarkdownTable = generateMarkdownTable;
exports.wrapInDetailsBlock = wrapInDetailsBlock;
exports.objectToMarkdownList = objectToMarkdownList;
exports.formatCliOutputAsMarkdown = formatCliOutputAsMarkdown;
/**
 * Formats a 2D array into a Markdown table.
 */
function generateMarkdownTable(headers, rows) {
    const headerRow = `| ${headers.join(' | ')} |`;
    const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`;
    const dataRows = rows.map((row) => `| ${row.join(' | ')} |`);
    return [headerRow, separatorRow, ...dataRows].join('\n');
}
/**
 * Wraps a string as a collapsible GitHub summary block.
 */
function wrapInDetailsBlock(title, content) {
    return `<details>\n<summary>${title}</summary>\n\n${content}\n\n</details>`;
}
/**
 * Converts an object to a Markdown bullet list.
 */
function objectToMarkdownList(obj) {
    return Object.entries(obj)
        .map(([key, value]) => `- **${key}**: \`${value}\``)
        .join('\n');
}
/**
 * Creates a summary block for a CLI command and its output.
 */
function formatCliOutputAsMarkdown(command, output) {
    return `### \`${command}\`\n\n\`\`\`bash\n${output}\n\`\`\``;
}
