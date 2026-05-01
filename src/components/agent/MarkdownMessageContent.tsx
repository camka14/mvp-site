'use client';

import type { ReactNode } from 'react';

const markdownTokenPatternSource = String.raw`(\[([^\]\n]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)|\*\*([^*\n]+)\*\*)`;

const isSafeLinkHref = (href: string): boolean => {
  if (href.startsWith('/')) return true;
  try {
    const url = new URL(href);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

function InlineMarkdown({ content, inverted = false }: { content: string; inverted?: boolean }) {
  const nodes: ReactNode[] = [];
  const markdownTokenPattern = new RegExp(markdownTokenPatternSource, 'g');
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = markdownTokenPattern.exec(content)) !== null) {
    const [raw, , label, href, boldText] = match;
    if (match.index > lastIndex) {
      nodes.push(content.slice(lastIndex, match.index));
    }

    if (label && href) {
      nodes.push(
        isSafeLinkHref(href) ? (
          <a
            key={`${href}-${match.index}`}
            href={href}
            className={`font-semibold underline underline-offset-2 ${inverted ? 'text-white' : 'text-blue-700'}`}
            rel={href.startsWith('/') ? undefined : 'noreferrer'}
          >
            {label}
          </a>
        ) : raw,
      );
    } else if (boldText) {
      nodes.push(<strong key={`bold-${match.index}`}>{boldText}</strong>);
    } else {
      nodes.push(raw);
    }

    lastIndex = match.index + raw.length;
  }

  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex));
  }

  return <>{nodes}</>;
}

type MarkdownBlock =
  | { type: 'paragraph'; lines: string[] }
  | { type: 'ordered-list'; items: string[] }
  | { type: 'unordered-list'; items: string[] };

const orderedListPattern = /^\s*\d+\.\s+(.+)$/;
const unorderedListPattern = /^\s*[-*]\s+(.+)$/;

const parseMarkdownBlocks = (content: string): MarkdownBlock[] => {
  const blocks: MarkdownBlock[] = [];
  const lines = content.split(/\r?\n/);
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const orderedMatch = orderedListPattern.exec(line);
    if (orderedMatch) {
      const items: string[] = [];
      while (index < lines.length) {
        const match = orderedListPattern.exec(lines[index]);
        if (!match) break;
        items.push(match[1].trim());
        index += 1;
      }
      blocks.push({ type: 'ordered-list', items });
      continue;
    }

    const unorderedMatch = unorderedListPattern.exec(line);
    if (unorderedMatch) {
      const items: string[] = [];
      while (index < lines.length) {
        const match = unorderedListPattern.exec(lines[index]);
        if (!match) break;
        items.push(match[1].trim());
        index += 1;
      }
      blocks.push({ type: 'unordered-list', items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length
      && lines[index].trim()
      && !orderedListPattern.test(lines[index])
      && !unorderedListPattern.test(lines[index])
    ) {
      paragraphLines.push(lines[index].trimEnd());
      index += 1;
    }
    blocks.push({ type: 'paragraph', lines: paragraphLines });
  }

  return blocks;
};

export function MarkdownMessageContent({ content, inverted = false }: { content: string; inverted?: boolean }) {
  const blocks = parseMarkdownBlocks(content);

  return (
    <div className="text-sm leading-relaxed">
      {blocks.map((block, blockIndex) => {
        if (block.type === 'ordered-list') {
          return (
            <ol key={`ol-${blockIndex}`} className="my-2 list-decimal space-y-1 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={`${blockIndex}-${itemIndex}`}>
                  <InlineMarkdown content={item} inverted={inverted} />
                </li>
              ))}
            </ol>
          );
        }

        if (block.type === 'unordered-list') {
          return (
            <ul key={`ul-${blockIndex}`} className="my-2 list-disc space-y-1 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={`${blockIndex}-${itemIndex}`}>
                  <InlineMarkdown content={item} inverted={inverted} />
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={`p-${blockIndex}`} className="my-2 first:mt-0 last:mb-0">
            {block.lines.map((line, lineIndex) => (
              <span key={`${blockIndex}-${lineIndex}`}>
                {lineIndex > 0 ? <br /> : null}
                <InlineMarkdown content={line} inverted={inverted} />
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
