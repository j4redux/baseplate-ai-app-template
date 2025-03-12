'use client';

import { exampleSetup } from 'prosemirror-example-setup';
import { inputRules } from 'prosemirror-inputrules';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import React, { memo, useEffect, useRef } from 'react';

import type { Suggestion } from '@/lib/db/schema';
import {
  documentSchema,
  handleTransaction,
  headingRule,
} from '@/lib/editor/config';
import {
  buildContentFromDocument,
  buildDocumentFromContent,
  createDecorations,
} from '@/lib/editor/functions';
import {
  projectWithPositions,
  suggestionsPlugin,
  suggestionsPluginKey,
} from '@/lib/editor/suggestions';

type EditorProps = {
  content: string;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
  status: 'streaming' | 'idle';
  isCurrentVersion: boolean;
  currentVersionIndex: number;
  suggestions: Array<Suggestion>;
  isDocument?: boolean; // Optional flag to indicate document-style rendering
};

function PureEditor({
  content,
  onSaveContent,
  suggestions,
  status,
  isDocument = false, // Default to false for backward compatibility
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  
  // Add debug logging to track content during streaming
  console.log(`[PureEditor] Rendering with status: ${status}`, {
    contentLength: content?.length || 0,
    isStreaming: status === 'streaming'
  });

  useEffect(() => {
    if (containerRef.current && !editorRef.current) {
      const state = EditorState.create({
        doc: buildDocumentFromContent(content),
        plugins: [
          ...exampleSetup({ schema: documentSchema, menuBar: false }),
          inputRules({
            rules: [
              headingRule(1),
              headingRule(2),
              headingRule(3),
              headingRule(4),
              headingRule(5),
              headingRule(6),
            ],
          }),
          suggestionsPlugin,
        ],
      });

      editorRef.current = new EditorView(containerRef.current, {
        state,
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
      editorRef.current.setProps({
        dispatchTransaction: (transaction) => {
          handleTransaction({
            transaction,
            editorRef,
            onSaveContent,
          });
        },
      });
    }
  }, [onSaveContent]);

  useEffect(() => {
    if (editorRef.current && content) {
      const currentContent = buildContentFromDocument(
        editorRef.current.state.doc,
      );

      // CRITICAL: Process content immediately to ensure real-time streaming
      // We need to update the editor as soon as new content arrives
      if (currentContent !== content) {
        // Enhanced logging for content updates during streaming
        console.log(`[TextEditor] Content update received:`, {
          contentLength: content.length,
          contentDelta: content.length - currentContent.length,
          isStreaming: status === 'streaming',
          timestamp: new Date().toISOString()
        });
        
        // Build a new document with the updated content
        // This ensures proper formatting of markdown and other content
        const newDocument = buildDocumentFromContent(content);

        // Create a transaction to replace the entire document content
        const transaction = editorRef.current.state.tr.replaceWith(
          0,
          editorRef.current.state.doc.content.size,
          newDocument.content,
        );

        // Mark this transaction as not triggering a save
        // This prevents unnecessary save operations during streaming
        transaction.setMeta('no-save', true);
        
        // Dispatch the transaction immediately to update the editor
        // This is what makes the content appear in real-time
        editorRef.current.dispatch(transaction);
        
        // Special handling for streaming state
        if (status === 'streaming') {
          // Use double requestAnimationFrame to ensure smooth scrolling to new content
          // This technique ensures the DOM has time to update before we attempt to scroll
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              // Scroll to show the latest content
              if (editorRef.current) {
                // Get the editor DOM element and scroll to the bottom
                const editorElement = editorRef.current.dom;
                if (editorElement) {
                  editorElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
                }
              }
            });
          });
          
          // Log detailed streaming update for debugging
          console.log(`[TextEditor] Processing streaming update:`, {
            contentLength: content.length,
            timestamp: new Date().toISOString()
          });
          
          // Force an immediate state update to refresh the view
          // This ensures proper formatting appears during streaming
          editorRef.current.updateState(editorRef.current.state);
          
          // Use double requestAnimationFrame for more reliable scrolling
          // First frame ensures the DOM has updated, second ensures rendering is complete
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              // Get the editor DOM element
              const editorDOM = editorRef.current?.dom as HTMLElement;
              // Scroll to the bottom to show the latest content
              if (editorDOM && editorDOM.parentElement) {
                editorDOM.parentElement.scrollTop = editorDOM.parentElement.scrollHeight;
              }
            });
          });
        }
      }
    }
  }, [content, status]);

  useEffect(() => {
    if (editorRef.current?.state.doc && content) {
      // Safely access editor state to avoid null reference errors
      const editorState = editorRef.current.state;
      const projectedSuggestions = projectWithPositions(
        editorState.doc,
        suggestions,
      ).filter(
        (suggestion) => suggestion.selectionStart && suggestion.selectionEnd,
      );

      // Safely create decorations using the editor reference
      const decorations = createDecorations(
        projectedSuggestions,
        editorRef.current,
      );

      // Safely access editor state to avoid null references
      const transaction = editorState.tr;
      transaction.setMeta(suggestionsPluginKey, { decorations });
      
      // Safely dispatch the transaction
      editorRef.current.dispatch(transaction);
    }
  }, [suggestions, content]);

  return (
    <div 
      className={`relative prose dark:prose-invert ${isDocument ? 'document-format' : ''} ${status === 'streaming' ? 'streaming-content' : ''} ${content ? 'has-content' : ''}`} 
      ref={containerRef} 
      data-streaming={status === 'streaming' ? 'true' : 'false'}
    />
  );
}

function areEqual(prevProps: EditorProps, nextProps: EditorProps) {
  return (
    prevProps.suggestions === nextProps.suggestions &&
    prevProps.currentVersionIndex === nextProps.currentVersionIndex &&
    prevProps.isCurrentVersion === nextProps.isCurrentVersion &&
    prevProps.isDocument === nextProps.isDocument &&
    !(prevProps.status === 'streaming' && nextProps.status === 'streaming') &&
    prevProps.content === nextProps.content &&
    prevProps.onSaveContent === nextProps.onSaveContent
  );
}

export const Editor = memo(PureEditor, areEqual);
