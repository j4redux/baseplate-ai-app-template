/**
 * Markdown component for rendering markdown content with different styles based on context.
 * 
 * Updates:
 * - Added isDocument prop to differentiate between document-style and regular messages
 * - Properly typed component props using react-markdown types
 * - Used proper semantic heading elements in both document and message contexts
 * - Added support for additional markdown elements (blockquotes, horizontal rules)
 * - Improved spacing and typography for consistent rendering
 * - Fixed code block rendering to properly handle inline and block code
 * - Added null/undefined check for children prop to prevent rendering errors
 */

import Link from 'next/link';
import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './code-block';

interface MarkdownProps {
  children: string;
  isDocument?: boolean;
}

// Define the components with proper typings
const documentComponents: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');
    const isInline = !match && typeof children === 'string';
    
    return isInline ? (
      <code
        className={`${className ?? ''} text-sm bg-zinc-100 dark:bg-zinc-800 py-0.5 px-1 rounded-md`}
        {...props}
      >
        {children}
      </code>
    ) : (
      <CodeBlock inline={false} className={className} {...props}>
        {children}
      </CodeBlock>
    );
  },
  pre({ children }) {
    return <>{children}</>;
  },
  ol({ children, ...props }) {
    return (
      <ol className="list-decimal list-outside ml-4 my-2" {...props}>
        {children}
      </ol>
    );
  },
  li({ children, ...props }) {
    return (
      <li className="py-1" {...props}>
        {children}
      </li>
    );
  },
  ul({ children, ...props }) {
    return (
      <ul className="list-disc list-outside ml-4 my-2" {...props}>
        {children}
      </ul>
    );
  },
  strong({ children, ...props }) {
    return (
      <span className="font-semibold" {...props}>
        {children}
      </span>
    );
  },
  a({ children, href, ...props }) {
    return (
      <Link
        className="text-blue-500 hover:underline"
        href={href ?? '#'}
        target="_blank"
        rel="noreferrer"
        {...props}
      >
        {children}
      </Link>
    );
  },
  h1({ children, ...props }) {
    return (
      <h1 className="text-3xl font-semibold mt-6 mb-2" {...props}>
        {children}
      </h1>
    );
  },
  h2({ children, ...props }) {
    return (
      <h2 className="text-2xl font-semibold mt-6 mb-2" {...props}>
        {children}
      </h2>
    );
  },
  h3({ children, ...props }) {
    return (
      <h3 className="text-xl font-semibold mt-6 mb-2" {...props}>
        {children}
      </h3>
    );
  },
  h4({ children, ...props }) {
    return (
      <h4 className="text-lg font-semibold mt-6 mb-2" {...props}>
        {children}
      </h4>
    );
  },
  h5({ children, ...props }) {
    return (
      <h5 className="text-base font-semibold mt-6 mb-2" {...props}>
        {children}
      </h5>
    );
  },
  h6({ children, ...props }) {
    return (
      <h6 className="text-sm font-semibold mt-6 mb-2" {...props}>
        {children}
      </h6>
    );
  },
  p({ children, ...props }) {
    // If the children is a string and contains newlines, split it and add <br/> tags
    if (typeof children === 'string' && children.includes('\n')) {
      const lines = children.split('\n');
      return (
        <p className="my-2 whitespace-pre-line" {...props}>
          {lines.map((line, i) => (
            <React.Fragment key={i}>
              {i > 0 && <br />}
              {line}
            </React.Fragment>
          ))}
        </p>
      );
    }
    
    // Otherwise, render normally
    return (
      <p className="my-2" {...props}>
        {children}
      </p>
    );
  },
  blockquote({ children, ...props }) {
    return (
      <blockquote className="border-l-4 border-zinc-300 dark:border-zinc-700 pl-4 italic my-2" {...props}>
        {children}
      </blockquote>
    );
  },
  hr({ ...props }) {
    return <hr className="my-4 border-zinc-200 dark:border-zinc-800" {...props} />;
  }
};

const messageComponents: Components = {
  ...documentComponents,
  // Override heading elements to maintain consistent text styling in messages
  h1({ children, ...props }) {
    return <p className="font-lexend" {...props}>{children}</p>;
  },
  h2({ children, ...props }) {
    return <p className="font-lexend" {...props}>{children}</p>;
  },
  h3({ children, ...props }) {
    return <p className="font-lexend" {...props}>{children}</p>;
  },
  h4({ children, ...props }) {
    return <p className="font-lexend" {...props}>{children}</p>;
  },
  h5({ children, ...props }) {
    return <p className="font-lexend" {...props}>{children}</p>;
  },
  h6({ children, ...props }) {
    return <p className="font-lexend" {...props}>{children}</p>;
  },
  // Ensure paragraphs have proper spacing and preserve line breaks
  p({ children, ...props }) {
    // If the children is a string and contains newlines, split it and add <br/> tags
    if (typeof children === 'string' && children.includes('\n')) {
      const lines = children.split('\n');
      return (
        <p className="my-2 whitespace-pre-line" {...props}>
          {lines.map((line, i) => (
            <React.Fragment key={i}>
              {i > 0 && <br />}
              {line}
            </React.Fragment>
          ))}
        </p>
      );
    }
    
    // Otherwise, render normally
    return (
      <p className="my-2" {...props}>
        {children}
      </p>
    );
  },
  // Adjust blockquote styling for messages
  blockquote({ children, ...props }) {
    return (
      <blockquote className="border-l-2 border-zinc-300 dark:border-zinc-700 pl-3 italic my-2" {...props}>
        {children}
      </blockquote>
    );
  }
};

const remarkPlugins = [remarkGfm];

const NonMemoizedMarkdown: React.FC<MarkdownProps> = ({ children, isDocument = false }) => (
  <ReactMarkdown 
    remarkPlugins={remarkPlugins}
    components={isDocument ? documentComponents : messageComponents}
  >
    {children || ''}
  </ReactMarkdown>
);

export const Markdown = memo(
  NonMemoizedMarkdown,
  (prevProps: MarkdownProps, nextProps: MarkdownProps): boolean => 
    prevProps.children === nextProps.children &&
    prevProps.isDocument === nextProps.isDocument
);
