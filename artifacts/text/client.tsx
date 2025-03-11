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

export const textArtifact = new Artifact<'text', TextArtifactMetadata>({
  kind: 'text',
  description: 'Useful for text content, like drafting essays and emails.',
  initialize: async ({ documentId, setMetadata }) => {
    const suggestions = await getSuggestions({ documentId });

    // Initialize with empty arrays to prevent undefined errors
    setMetadata({
      suggestions: suggestions ?? [],
      messages: [],
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
      
      // Process the content to prevent accidental heading formatting
      const processedContent = content.replace(/^(#{1,6}\s)/gm, '\\$1');
      
      // Check for natural message boundaries
      const boundaryPatterns = [
        /\n\s*\n(?=[A-Z])/, // Paragraph break followed by capital letter
        /(?<=\.)\s+(?=[A-Z])/, // Sentence end followed by capital letter
        /\n(?=[0-9]+\.)/, // New line followed by numbered list
        /\n(?=[-*]\s)/ // New line followed by bullet point
      ];
      
      const hasBoundary = boundaryPatterns.some(pattern => processedContent.match(pattern));
      
      setMetadata((prevMetadata) => {
        // Ensure we have a valid metadata object with initialized arrays
        const metadata = prevMetadata ?? { suggestions: [], messages: [] };
        
        // Start a new message if we detect a boundary or if this is the first message
        if (hasBoundary || !metadata.messages?.length) {
          return {
            ...metadata,
            messages: [
              ...metadata.messages,
              {
                id: generateUUID(),
                content: processedContent.trim(),
                timestamp: Date.now(),
              },
            ],
          };
        }

        // Append to the latest message with proper spacing
        const messages = [...metadata.messages];
        const lastMessage = messages[messages.length - 1];
        const needsSpace = !lastMessage.content.endsWith(' ') && !processedContent.startsWith(' ');
        lastMessage.content += (needsSpace ? ' ' : '') + processedContent.trim();

        return { ...metadata, messages };
      });
      
      // Update artifact content for backward compatibility
      setArtifact((draftArtifact) => ({
        ...draftArtifact,
        content: draftArtifact.content + content,
        status: 'streaming',
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

    return (
      <>
        <div className="flex flex-col space-y-8 py-8 md:p-20 px-4">
          {metadata?.messages.map((message, index) => (
            <div key={message.id} className="flex flex-row">
              <Editor
                content={message.content}
                suggestions={metadata.suggestions}
                isCurrentVersion={isCurrentVersion}
                currentVersionIndex={currentVersionIndex}
                status={status}
                onSaveContent={(newContent) => {
                  // Update the specific message's content
                  setMetadata((metadata) => {
                    const messages = [...metadata.messages];
                    messages[index] = { ...message, content: newContent };
                    return { ...metadata, messages };
                  });
                }}
              />

              {metadata.suggestions && metadata.suggestions.length > 0 ? (
                <div className="md:hidden h-dvh w-12 shrink-0" />
              ) : null}
            </div>
          ))}
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
