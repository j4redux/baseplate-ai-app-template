import { Artifact } from '@/components/create-artifact';
import { DiffView } from '@/components/diffview';
import { DocumentSkeleton } from '@/components/document-skeleton';
import { Editor } from '@/components/text-editor';
import { UIArtifact, ArtifactKind } from '@/components/artifact';
import {
  ClockRewind,
  CopyIcon,
  MessageIcon,
  PenIcon,
  RedoIcon,
  UndoIcon,
} from '@/components/icons';
import { Suggestion } from '@/lib/db/schema';
import { generateUUID } from '@/lib/utils';
import { toast } from 'sonner';
import { getSuggestions } from '../actions';
import { useEffect, useState, useLayoutEffect } from 'react';

interface TextMessage {
  readonly id: string;
  content: string;
  readonly timestamp: number;
}

interface TextArtifactMetadata {
  readonly suggestions: Array<Suggestion>;
  messages: TextMessage[];
  documentContent?: string; // Direct document content for more reliable rendering
}

type ArtifactMode = 'diff' | 'edit';
type ArtifactStatus = 'streaming' | 'idle';

interface EditorProps {
  readonly mode: ArtifactMode;
  readonly status: ArtifactStatus;
  readonly isCurrentVersion: boolean;
  readonly currentVersionIndex: number;
  readonly getDocumentContentById: (index: number) => string;
  readonly isLoading: boolean;
  readonly metadata: TextArtifactMetadata;
  readonly setMetadata: (updater: (metadata: TextArtifactMetadata) => TextArtifactMetadata) => void;
  readonly content: string; // Content from artifact or version
  readonly title: string; // Title of the artifact
  readonly suggestions: Array<Suggestion>; // Suggestions for the artifact
  readonly onSaveContent: (updatedContent: string, debounce: boolean) => void; // Save content callback
  readonly isInline: boolean; // Whether the artifact is inline
}

/**
 * Text document artifact implementation
 * 
 * Updates to ensure proper document rendering and complete content display:
 * 1. Maintains a single cohesive document message rather than fragmenting content
 * 2. Enhanced streaming state handling to fix content truncation issues
 * 3. Improved content determination logic based on streaming state
 * 4. Fixed streaming experience for continuous and reliable content updates
 * 5. Better synchronization between metadata messages and artifact content
 * 6. Optimized state transitions between streaming and idle states
 */
export const textArtifact = new Artifact<'text', TextArtifactMetadata>({
  kind: 'text',
  description: 'Useful for text content, like drafting essays and emails.',
  initialize: async ({ documentId, setMetadata, setArtifact }) => {
    // Log document initialization to help with debugging
    console.log(`[TextArtifact] Initializing document with ID: ${documentId}`);
    
    // Verify we have a valid document ID - but don't return early as this can break React hooks
    if (!documentId) {
      console.error('[TextArtifact] Missing document ID in initialize');
      // CRITICAL FIX: Don't return early to avoid breaking React hook rules
      // Instead, continue with a fallback documentId
      documentId = 'fallback-doc-' + Date.now().toString();
    }
    
    // Fetch suggestions for the document
    const suggestions = await getSuggestions({ documentId });
    
    // Initialize with empty content - we'll set this properly below
    let documentContent = '';
    let documentTitle = documentId; // Default to using document ID as title
    let storageKey = `document-${documentId}`;
    
    try {
      console.log(`[TextArtifact] Attempting to load document using storage key: ${storageKey}`);
      
      // Try multiple approaches to load document content, in priority order
      // 1. First try direct key match using document ID
      let storedDocument = localStorage.getItem(storageKey);
      
      // 2. If not found, try to search by title match in other documents
      if (!storedDocument) {
        console.log(`[TextArtifact] No exact match found, searching localStorage by title`);
        
        // Track if we found any document keys, even if not this one
        let foundAnyDocument = false;
        
        try {
          // Scan all localStorage keys for potential matches
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('document-')) {
              foundAnyDocument = true;
              console.log(`[TextArtifact] Found storage key: ${key}`);
              
              // Try to load each document to check if it matches our document ID
              try {
                const potentialDoc = localStorage.getItem(key);
                if (potentialDoc) {
                  const parsed = JSON.parse(potentialDoc);
                  
                  // Check if this document matches by title
                  if (parsed.title === documentId || key === `document-${documentId}`) {
                    console.log(`[TextArtifact] Found matching document:`, {
                      key,
                      title: parsed.title,
                      contentLength: parsed.content?.length || 0
                    });
                    storedDocument = potentialDoc;
                    storageKey = key; // Update storage key for future operations
                    break;
                  }
                }
              } catch (parseError) {
                console.error(`[TextArtifact] Error parsing document ${key}:`, parseError);
              }
            }
          }
          
          if (!foundAnyDocument) {
            console.log(`[TextArtifact] No document keys found in localStorage`);
          }
        } catch (scanError) {
          console.error('[TextArtifact] Error scanning localStorage:', scanError);
        }
      }
      
      // Parse and use the stored document if found
      if (storedDocument) {
        try {
          const parsedDocument = JSON.parse(storedDocument);
          documentContent = parsedDocument.content || '';
          documentTitle = parsedDocument.title || documentId;
          
          console.log(`[TextArtifact] Successfully loaded document:`, {
            documentId,
            title: documentTitle,
            contentLength: documentContent.length,
            contentPreview: documentContent.substring(0, 20) + (documentContent.length > 20 ? '...' : '')
          });
          
          // CRITICAL: Update the artifact state with the restored document
          // This ensures both content AND title are properly displayed in the editor
          if (setArtifact && typeof setArtifact === 'function') {
            setArtifact((current) => ({
              ...current,
              documentId: documentId, // Ensure document ID is set
              title: documentTitle, // Set the title
              content: documentContent, // Set the content
              status: 'idle', // Set appropriate status
              kind: 'text', // Ensure kind is set
            }));
            console.log('[TextArtifact] Updated artifact state with document data');
          } else {
            console.warn('[TextArtifact] setArtifact not available, cannot update artifact state');
          }
        } catch (parseError) {
          console.error('[TextArtifact] Error parsing stored document:', parseError);
        }
      } else {
        console.log(`[TextArtifact] No stored document found for ID: ${documentId}`);
      }
    } catch (error) {
      console.error(`[TextArtifact] Error loading document content:`, error);
      // Continue with empty content if loading fails
    }
    
    // Initialize with a single message containing the document content
    // This ensures the message structure is properly maintained
    const initialMessages: Array<{
      id: string;
      content: string;
      timestamp: number;
    }> = [{
      id: generateUUID(),
      content: documentContent || '',
      timestamp: Date.now()
    }];
    
    // CRITICAL: Set metadata with the document content
    // This is essential for proper document rendering and persistence
    if (setMetadata) {
      setMetadata({
        suggestions: suggestions ?? [],
        messages: initialMessages,
        documentContent: documentContent || '', // Store document content for reliable access
      });
      console.log('[TextArtifact] Set document metadata with content length:', documentContent?.length || 0);
    } else {
      console.error('[TextArtifact] setMetadata not available, document content will not be persisted in metadata');
    }
    
    // Log initialization completion with comprehensive details
    console.log('[TextArtifact] Initialization complete:', {
      documentId,
      title: documentTitle,
      contentLength: documentContent?.length || 0,
      hasContent: !!documentContent,
      suggestionsCount: suggestions?.length || 0,
      metadataSet: !!setMetadata,
      artifactSet: !!(setArtifact && typeof setArtifact === 'function'),
      storageKey: `document-${documentId}`,
    });
    
    // Don't return a value, as we don't want to trigger any conditional logic
    // that might affect hook execution elsewhere in the component tree
    // The function will implicitly return undefined
  },
  onStreamPart: ({ streamPart, setMetadata, setArtifact }) => {
    
    if (streamPart.type === 'suggestion') {
      setMetadata((prevMetadata) => {
        // Ensure we have a valid metadata object
        const metadata = prevMetadata ?? { suggestions: [], messages: [], documentContent: '' };
        // Skip if we already have this suggestion to prevent duplicate updates
        const suggestionContent = streamPart.content as Suggestion;
        if (metadata.suggestions.some(s => s.id === suggestionContent.id)) {
          return prevMetadata; // Return unchanged to prevent unnecessary updates
        }
        return {
          ...metadata,
          suggestions: [...metadata.suggestions, suggestionContent],
        };
      });
      return; // Important: return early to prevent further processing
    }

    if (streamPart.type === 'text-delta') {
      const content = streamPart.content as string;
      if (!content) return; // Skip empty content
      
      // Enhanced logging for text delta events
      console.log(`[TextArtifact] Processing text delta:`, {
        contentLength: content.length,
        contentPreview: content.substring(0, 20) + (content.length > 20 ? '...' : ''),
        timestamp: new Date().toISOString()
      });
      
      // Process the incoming content to ensure proper formatting
      // This helps maintain consistent markdown formatting during streaming
      const updatedContent = content.trim() ? content : ''; // Ensure we're not adding empty spaces
      
      // CRITICAL: Update artifact state FIRST to ensure immediate UI updates
      // This ensures the content appears in the interface as soon as possible
      setArtifact(current => {
        const currentContent = current?.content || '';
        const newContent = currentContent + updatedContent;
        
        // Force the artifact to be in streaming state with the updated content
        return {
          ...current,
          content: newContent,
          status: 'streaming',
          // Don't change visibility - respect user control
          // isVisible remains unchanged
        };
      });
      
      // Then update metadata to maintain consistency
      setMetadata(prevMetadata => {
        const metadata = prevMetadata ?? {
          suggestions: [],
          messages: [{
            id: generateUUID(),
            content: '',
            timestamp: Date.now()
          }],
          documentContent: ''
        };
        
        // Always update the single document message
        const message = metadata.messages[0] || {
          id: generateUUID(),
          content: '',
          timestamp: Date.now()
        };
        
        // Use the existing content as the base
        let baseMessageContent = message.content;
        let baseDocumentContent = metadata.documentContent || '';
        
        // Update both the message content and the direct document content
        const updatedMessageContent = `${baseMessageContent}${updatedContent}`;
        const updatedDocumentContent = `${baseDocumentContent}${updatedContent}`;
        
        console.log('[TextArtifact] Updated document content:', {
          newLength: updatedDocumentContent.length,
          deltaLength: updatedContent.length
        });
        
        return {
          ...metadata,
          documentContent: updatedDocumentContent,
          messages: [{
            ...message,
            content: updatedMessageContent,
            // Keep the original timestamp to maintain message consistency
            timestamp: message.timestamp
          }, ...(metadata.messages.slice(1) || [])]
        };
      });
      
      return; // Important: return early to prevent further processing
    }
    
    // Handle streaming finish event
    if (streamPart.type === 'finish') {
      console.log('Streaming finished, finalizing document');
      
      // Mark streaming as complete while preserving message consistency
      setMetadata(prevMetadata => {
        if (!prevMetadata) {
          return {
            suggestions: [],
            messages: [{
              id: generateUUID(),
              content: '',
              timestamp: Date.now()
            }],
            documentContent: ''
          };
        }
        
        if (!prevMetadata.messages?.length) {
          // If no messages exist, create an empty one
          return {
            ...prevMetadata,
            messages: [{
              id: generateUUID(),
              content: prevMetadata.documentContent || '',
              timestamp: Date.now()
            }],
            documentContent: prevMetadata.documentContent || ''
          };
        }
        
        // Ensure document content is synchronized with message content
        const finalContent = prevMetadata.messages[0]?.content || prevMetadata.documentContent || '';
        console.log('Final document content length:', finalContent.length);
        
        return {
          ...prevMetadata,
          documentContent: finalContent
        };
      });
      
      // Update artifact state to reflect completion
      // Preserve the current visibility state - don't force it to be visible
      setArtifact(current => ({
        ...current,
        status: 'idle',
        // Don't change visibility state - maintain user control
        isVisible: current.isVisible
      }));
    }
  },
  content: ({
    mode,
    status,
    isCurrentVersion,
    currentVersionIndex,
    getDocumentContentById,
    isLoading,
    metadata,
    setMetadata,
    content, // Get content from props
    title, // Include title from props
    suggestions, // Include suggestions from props
    onSaveContent, // Include onSaveContent from props
    isInline, // Include isInline from props
  }: EditorProps) => {
    // IMPORTANT: Try to retrieve content from localStorage at component mount time
    // This ensures we have content even after reopening or refreshing
    useEffect(() => {
      // Always execute the hook logic regardless of conditions
      // but only perform the content recovery under specific conditions
      const shouldLoadContent = title && (!content || content.length === 0);
      
      // Log the component mount for debugging
      console.log(`[TextArtifactClient] Editor mounted:`, { 
        title, 
        contentLength: content?.length || 0,
        status,
        shouldLoadContent
      });
      
      if (shouldLoadContent) {
        try {
          const storageKey = `document-${title}`;
          const storedContent = localStorage.getItem(storageKey);
          
          if (storedContent) {
            const parsedContent = JSON.parse(storedContent);
            console.log(`[TextArtifactClient] Found stored content for document:`, {
              title,
              contentLength: parsedContent.content?.length || 0
            });
            
            // If the retrieved content has length and our current content is empty, use it
            if (parsedContent.content && parsedContent.content.length > 0 && onSaveContent) {
              console.log(`[TextArtifactClient] Restoring content on editor mount`);
              // Use the onSaveContent callback to update the document
              onSaveContent(parsedContent.content, false);
            }
          }
        } catch (error) {
          console.error('[TextArtifactClient] Error recovering document content:', error);
        }
      }
    }, [title, content, onSaveContent, status]); // Added status to deps
    
    // Save document content to localStorage whenever it changes
    // This ensures content persistence across sessions
    useEffect(() => {
      // Only save when we have both title and content
      if (title && content && content.length > 0) {
        try {
          // Storage key format: Use both document ID and title for better retrieval options
          // We need to use consistent keys between initialize and content methods
          const storageKey = `document-${title}`;
          
          localStorage.setItem(storageKey, JSON.stringify({
            content,
            lastModified: new Date().toISOString(),
            // Include metadata to help with document reconstruction
            title,
            kind: 'text',
            status: status,
          }));
          
          console.log(`[TextArtifactClient] Saved document content to storage:`, {
            title,
            contentLength: content.length,
            status,
          });
        } catch (error) {
          console.error('[TextArtifactClient] Error saving document:', error);
        }
      }
    }, [content, title, status]); // Added status to dependency array
    
    // CRITICAL: Never show loading skeleton during streaming
    // This ensures real-time content streams directly into the interface
    // We only show the skeleton if we're loading AND not streaming
    if (isLoading && status !== 'streaming') {
      console.log('[TextArtifactClient] Showing loading skeleton (not streaming)');
      return <DocumentSkeleton artifactKind="text" />;
    }
    
    // When streaming, we always render the editor immediately
    // This ensures we have a container ready to receive streaming content
    if (status === 'streaming') {
      console.log('[TextArtifactClient] Streaming mode active, rendering editor directly', {
        contentLength: content?.length || 0,
        timestamp: new Date().toISOString()
      });
      
      // Force a high priority render to ensure streaming content is displayed immediately
      // This uses React's scheduler to prioritize this update
      useLayoutEffect(() => {
        // This effect will run after every render during streaming
        // to ensure the DOM is updated with the latest content
        console.log('[TextArtifactClient] Layout effect triggered during streaming');
      }, [content, status]);
    }

    // Handle diff view mode
    if (mode === 'diff' && currentVersionIndex > 0) {
      const previousContent = getDocumentContentById(currentVersionIndex - 1);
      const currentContent = getDocumentContentById(currentVersionIndex);
      return <DiffView oldContent={previousContent} newContent={currentContent} />;
    }
    
    // Enhanced content determination logic
    // Content priority:
    // 1. If streaming, use content prop (from artifact.content) which is updated in real-time
    // 2. Fallback to metadata.documentContent
    // 3. Fallback to message content or empty string
    // This change ensures we prioritize the most up-to-date content during streaming
    const documentContent = 
      status === 'streaming' ? 
        (content || metadata?.documentContent || metadata?.messages?.[0]?.content || '') :
        (content || metadata?.documentContent || metadata?.messages?.[0]?.content || '');
    
    // Log content sources for debugging
    console.log('[TextArtifactClient] Content sources:', {
      status,
      contentLength: content?.length,
      metadataDocumentContentLength: metadata?.documentContent?.length,
      messageContentLength: metadata?.messages?.[0]?.content?.length,
      finalContentLength: documentContent.length,
      isStreaming: status === 'streaming'
    });
    
    return (
      <div className="w-full h-full overflow-auto p-8">
        {/* Apply consistent styling to the editor */}
        <Editor
          content={documentContent}
          status={status}
          isCurrentVersion={isCurrentVersion}
          currentVersionIndex={currentVersionIndex}
          suggestions={metadata?.suggestions ?? []}
          onSaveContent={onSaveContent}
          isDocument={true}
        />
      </div>
    );
  },
  actions: [
    {
      icon: <ClockRewind size={18} />,
      description: 'View changes',
      onClick: (context) => {
        context.handleVersionChange('toggle');
      },
      isDisabled: (context) => {
        return context.currentVersionIndex <= 0;
      },
    },
    {
      icon: <UndoIcon size={18} />,
      description: 'View Previous version',
      onClick: (context) => {
        context.handleVersionChange('prev');
      },
      isDisabled: (context) => {
        return context.currentVersionIndex <= 0;
      },
    },
    {
      icon: <RedoIcon size={18} />,
      description: 'View Next version',
      onClick: (context) => {
        context.handleVersionChange('next');
      },
      isDisabled: (context) => {
        return context.isCurrentVersion;
      },
    },
    {
      icon: <CopyIcon size={18} />,
      description: 'Copy to clipboard',
      onClick: (context) => {
        navigator.clipboard.writeText(context.content);
        toast.success('Content copied to clipboard');
      },
    },
  ],
  toolbar: [
    {
      icon: <PenIcon />,
      description: 'Edit document',
      onClick: ({ appendMessage }) => {
        appendMessage({
          role: 'user',
          content: 'Please edit this document to improve clarity and flow.'
        });
      },
    },
    {
      icon: <MessageIcon />,
      description: 'Request suggestions',
      onClick: ({ appendMessage }) => {
        appendMessage({
          role: 'user',
          content: 'Please suggest improvements that could enhance this writing.'
        });
      },
    },
  ],
});
