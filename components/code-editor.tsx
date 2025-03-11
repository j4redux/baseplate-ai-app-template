'use client';

import { EditorView } from '@codemirror/view';
import { EditorState, Transaction } from '@codemirror/state';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { markdown } from '@codemirror/lang-markdown';
import { LanguageSupport } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { oneDark } from '@codemirror/theme-one-dark';
import { basicSetup } from 'codemirror';
import React, { memo, useEffect, useRef, useState } from 'react';
import { Suggestion } from '@/lib/db/schema';

type EditorProps = {
  content: string;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
  status: 'streaming' | 'idle';
  isCurrentVersion: boolean;
  currentVersionIndex: number;
  suggestions: Array<Suggestion>;
};

/**
 * Get the appropriate language support for the detected language
 * @param language - The detected programming language
 * @returns Language support for CodeMirror
 */
function getLanguageSupport(language: string): LanguageSupport {
  // Convert language to lowercase for case-insensitive matching
  const lang = language.toLowerCase();
  
  // Map common language identifiers to their CodeMirror language support
  switch (lang) {
    case 'python':
    case 'py':
      return python();
    case 'javascript':
    case 'js':
      return javascript();
    case 'typescript':
    case 'ts':
      return javascript({ typescript: true });
    case 'jsx':
    case 'react':
      return javascript({ jsx: true });
    case 'tsx':
      return javascript({ jsx: true, typescript: true });
    case 'java':
      return java();
    case 'c':
    case 'cpp':
    case 'c++':
      return cpp();
    case 'html':
      return html();
    case 'css':
      return css();
    case 'markdown':
    case 'md':
      return markdown();
    default:
      // Default to python if language is not recognized
      return python();
  }
}

function PureCodeEditor({ content, onSaveContent, status }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const [language, setLanguage] = useState<string>('python');
  
  // Extract language from content if it contains a language marker
  useEffect(() => {
    if (content) {
      const languageMarker = content.match(/^language:([a-zA-Z0-9+#]+)\n/);
      if (languageMarker && languageMarker[1]) {
        // Set the detected language
        setLanguage(languageMarker[1]);
        
        // Remove the language marker from the content for the editor
        // This is handled separately in the content update effect
      }
    }
  }, [content]);

  useEffect(() => {
    if (containerRef.current && !editorRef.current) {
      const startState = EditorState.create({
        doc: cleanContent(content),
        extensions: [basicSetup, getLanguageSupport(language), oneDark],
      });

      editorRef.current = new EditorView({
        state: startState,
        parent: containerRef.current,
      });
    }

    return () => {
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
    // NOTE: we only want to run this effect once
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (editorRef.current) {
      const updateListener = EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const transaction = update.transactions.find(
            (tr) => !tr.annotation(Transaction.remote),
          );

          if (transaction) {
            const newContent = update.state.doc.toString();
            onSaveContent(newContent, true);
          }
        }
      });

      const currentSelection = editorRef.current.state.selection;

      const newState = EditorState.create({
        doc: editorRef.current.state.doc,
        extensions: [basicSetup, getLanguageSupport(language), oneDark, updateListener],
        selection: currentSelection,
      });

      editorRef.current.setState(newState);
    }
  }, [onSaveContent]);

  /**
   * Clean content by removing language markers
   */
  const cleanContent = (content: string): string => {
    // Remove language marker if present
    return content.replace(/^language:[a-zA-Z0-9+#]+\n/, '');
  };

  useEffect(() => {
    if (editorRef.current && content) {
      const currentContent = editorRef.current.state.doc.toString();
      // Clean the content to remove any language markers
      const cleanedContent = cleanContent(content);

      if (status === 'streaming' || currentContent !== cleanedContent) {
        const transaction = editorRef.current.state.update({
          changes: {
            from: 0,
            to: currentContent.length,
            insert: cleanedContent,
          },
          annotations: [Transaction.remote.of(true)],
        });

        editorRef.current.dispatch(transaction);
      }
    }
  }, [content, status]);

  return (
    <div
      className="relative not-prose w-full pb-[calc(80dvh)] text-sm"
      ref={containerRef}
    />
  );
}

function areEqual(prevProps: EditorProps, nextProps: EditorProps) {
  if (prevProps.suggestions !== nextProps.suggestions) return false;
  if (prevProps.currentVersionIndex !== nextProps.currentVersionIndex)
    return false;
  if (prevProps.isCurrentVersion !== nextProps.isCurrentVersion) return false;
  if (prevProps.status === 'streaming' && nextProps.status === 'streaming')
    return false;
  if (prevProps.content !== nextProps.content) return false;

  return true;
}

export const CodeEditor = memo(PureCodeEditor, areEqual);
