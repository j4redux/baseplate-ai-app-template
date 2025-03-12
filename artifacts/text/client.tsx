import { Artifact } from '@/components/create-artifact';
import { DiffView } from '@/components/diffview';
import { DocumentSkeleton } from '@/components/document-skeleton';
import { Editor } from '@/components/text-editor';
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

interface TextMessage {
  readonly id: string;
  content: string;
  readonly timestamp: number;
}

interface TextArtifactMetadata {
  readonly suggestions: Array<Suggestion>;
  messages: TextMessage[];
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
}

/**
 * Text document artifact implementation
 * 
 * Updates to ensure proper document rendering and complete content display:
 * 1. Maintains a single cohesive document message rather than fragmenting content
 * 2. Properly handles streaming-to-idle state transitions to show complete content
 * 3. Ensures consistent document rendering with proper markdown formatting
 */
export const textArtifact = new Artifact<'text', TextArtifactMetadata>({
  kind: 'text',
  description: 'Useful for text content, like drafting essays and emails.',
  initialize: async ({ documentId, setMetadata }) => {
    const suggestions = await getSuggestions({ documentId });
    
    // Initialize with empty messages array
    // We'll populate this from the document content once it's loaded
    const initialMessages: Array<{
      id: string;
      content: string;
      timestamp: number;
    }> = [];
    
    // Initialize with content if available
    setMetadata({
      suggestions: suggestions ?? [],
      messages: initialMessages,
    });
  },
  onStreamPart: ({ streamPart, setMetadata, setArtifact }) => {
    if (streamPart.type === 'suggestion') {
      setMetadata((prevMetadata) => {
        // Ensure we have a valid metadata object
        const metadata = prevMetadata ?? { suggestions: [], messages: [] };
        return {
          ...metadata,
          suggestions: [...metadata.suggestions, streamPart.content as Suggestion],
        };
      });
    }

    if (streamPart.type === 'text-delta') {
      const content = streamPart.content as string;
      
      // Instead of creating multiple messages based on boundaries,
      // maintain a single document message to ensure full document is properly displayed
      setMetadata((prevMetadata) => {
        // Ensure we have a valid metadata object with initialized arrays
        const metadata = prevMetadata ?? { suggestions: [], messages: [] };
        
        if (!metadata.messages.length) {
          // First chunk of content - create the message
          return {
            ...metadata,
            messages: [
              {
                id: generateUUID(),
                content: content,
                timestamp: Date.now(),
              },
            ],
          };
        } else {
          // Append to the existing document content
          const messages = [...metadata.messages];
          const documentMessage = messages[0]; // Always use the first message for document content
          documentMessage.content += content;
          
          return { ...metadata, messages };
        }
      });
      
      // Update artifact content for backward compatibility
      setArtifact((draftArtifact) => ({
        ...draftArtifact,
        content: draftArtifact.content + content,
        status: 'streaming',
      }));
    }
    
    // Handle streaming finish event
    if (streamPart.type === 'finish') {
      // Finalize the artifact status
      setArtifact((draftArtifact) => ({
        ...draftArtifact,
        status: 'idle',
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
  }: EditorProps) => {
    if (isLoading) {
      return <DocumentSkeleton artifactKind="text" />;
    }

    if (mode === 'diff') {
      const oldContent = getDocumentContentById(currentVersionIndex - 1);
      const newContent = getDocumentContentById(currentVersionIndex);

      return <DiffView oldContent={oldContent} newContent={newContent} />;
    }
    
    // Determine which content to display based on version state
    // This ensures we display the full document content after streaming completes
    let documentContent = '';
    
    // If we're looking at a specific version, use that content
    if (currentVersionIndex >= 0) {
      documentContent = getDocumentContentById(currentVersionIndex);
    } else {
      // Fallback to the metadata message content for streaming updates
      documentContent = metadata?.messages?.[0]?.content || '';
    }
    
    // If we have no content but are in streaming mode, this could indicate
    // the content hasn't been fully loaded or initialized yet
    
    return (
      <>
        <div className="flex flex-col py-8 md:p-20 px-4">
          <div className="flex flex-row w-full">
            <Editor
              content={documentContent}
              suggestions={metadata?.suggestions || []}
              isCurrentVersion={isCurrentVersion}
              currentVersionIndex={currentVersionIndex}
              status={status}
              isDocument={true} /* Ensure document-style rendering */
              onSaveContent={(newContent) => {
                // Update the document content
                setMetadata((metadata) => {
                  if (!metadata?.messages?.length) {
                    // Create a new message if one doesn't exist
                    return {
                      ...metadata,
                      messages: [
                        {
                          id: generateUUID(),
                          content: newContent,
                          timestamp: Date.now(),
                        },
                      ],
                    };
                  }
                  
                  // Update the existing message
                  const messages = [...metadata.messages];
                  messages[0] = { ...messages[0], content: newContent };
                  return { ...metadata, messages };
                });
              }}
            />

            {metadata?.suggestions && metadata.suggestions.length > 0 ? (
              <div className="md:hidden h-dvh w-12 shrink-0" />
            ) : null}
          </div>
        </div>
      </>
    );
  },
  actions: [
    {
      icon: <ClockRewind size={18} />,
      description: 'View changes',
      onClick: ({ handleVersionChange }) => {
        handleVersionChange('toggle');
      },
      isDisabled: ({ currentVersionIndex, setMetadata }) => {
        if (currentVersionIndex === 0) {
          return true;
        }

        return false;
      },
    },
    {
      icon: <UndoIcon size={18} />,
      description: 'View Previous version',
      onClick: ({ handleVersionChange }) => {
        handleVersionChange('prev');
      },
      isDisabled: ({ currentVersionIndex }) => {
        if (currentVersionIndex === 0) {
          return true;
        }

        return false;
      },
    },
    {
      icon: <RedoIcon size={18} />,
      description: 'View Next version',
      onClick: ({ handleVersionChange }) => {
        handleVersionChange('next');
      },
      isDisabled: ({ isCurrentVersion }) => {
        if (isCurrentVersion) {
          return true;
        }

        return false;
      },
    },
    {
      icon: <CopyIcon size={18} />,
      description: 'Copy to clipboard',
      onClick: ({ content }) => {
        navigator.clipboard.writeText(content);
        toast.success('Copied to clipboard!');
      },
    },
  ],
  toolbar: [
    {
      icon: <PenIcon />,
      description: 'Add final polish',
      onClick: ({ appendMessage }) => {
        appendMessage({
          role: 'user',
          content:
            'Please add final polish and check for grammar, add section titles for better structure, and ensure everything reads smoothly.',
        });
      },
    },
    {
      icon: <MessageIcon />,
      description: 'Request suggestions',
      onClick: ({ appendMessage }) => {
        appendMessage({
          role: 'user',
          content:
            'Please add suggestions you have that could improve the writing.',
        });
      },
    },
  ],
});
