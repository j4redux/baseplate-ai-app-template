'use client';

import React from 'react';
import type { Components } from 'react-markdown';

interface CodeBlockProps {
  inline?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const CodeBlock: React.FC<CodeBlockProps & React.HTMLAttributes<HTMLElement>> = ({
  inline = false,
  className,
  children,
  ...props
}) => {
  if (inline) {
    return (
      <code
        className={`${className ?? ''} text-sm bg-zinc-100 dark:bg-zinc-800 py-0.5 px-1 rounded-md`}
        {...props}
      >
        {children}
      </code>
    );
  }

  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';

  return (
    <pre
      className="not-prose relative text-sm w-full overflow-x-auto dark:bg-zinc-900 p-4 border border-zinc-200 dark:border-zinc-700 rounded-xl dark:text-zinc-50 text-zinc-900"
      {...props}
    >
      {language && (
        <div 
          className="absolute right-4 top-3 text-xs text-zinc-500 dark:text-zinc-400"
          aria-label={`Language: ${language}`}
        >
          {language}
        </div>
      )}
      <code className={className ?? ''}>{children}</code>
    </pre>
  );
};
