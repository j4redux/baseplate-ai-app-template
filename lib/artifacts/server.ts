import { codeDocumentHandler } from '@/artifacts/code/server';
import { imageDocumentHandler } from '@/artifacts/image/server';
import { sheetDocumentHandler } from '@/artifacts/sheet/server';
import { textDocumentHandler } from '@/artifacts/text/server';
import { ArtifactKind } from '@/components/artifact';
import { DataStreamWriter } from 'ai';
import { Document } from '../db/schema';
import { saveDocument } from '../db/queries';
import { Session } from 'next-auth';

export interface SaveDocumentProps {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}

export interface CreateDocumentCallbackProps {
  id: string;
  title: string;
  dataStream: DataStreamWriter;
  session: Session;
}

export interface UpdateDocumentCallbackProps {
  document: Document;
  description: string;
  dataStream: DataStreamWriter;
  session: Session;
}

export interface DocumentHandler<T = ArtifactKind> {
  kind: T;
  onCreateDocument: (args: CreateDocumentCallbackProps) => Promise<void>;
  onUpdateDocument: (args: UpdateDocumentCallbackProps) => Promise<void>;
}

/**
 * Map to track documents currently being updated to prevent recursive updates
 */
const updateLocks = new Map<string, boolean>();

/**
 * Creates a document handler for a specific artifact kind
 * @param config Configuration object containing handler callbacks
 * @returns DocumentHandler instance
 */
export function createDocumentHandler<T extends ArtifactKind>(config: {
  kind: T;
  onCreateDocument: (params: CreateDocumentCallbackProps) => Promise<string>;
  onUpdateDocument: (params: UpdateDocumentCallbackProps) => Promise<string>;
}): DocumentHandler<T> {
  return {
    kind: config.kind,
    onCreateDocument: async (args: CreateDocumentCallbackProps) => {
      const draftContent = await config.onCreateDocument({
        id: args.id,
        title: args.title,
        dataStream: args.dataStream,
        session: args.session,
      });

      if (args.session?.user?.id) {
        await saveDocument({
          id: args.id,
          title: args.title,
          content: draftContent,
          kind: config.kind,
          userId: args.session.user.id,
        });
      }

      return;
    },
    onUpdateDocument: async (args: UpdateDocumentCallbackProps): Promise<void> => {
      // Check if document is already being updated
      if (updateLocks.get(args.document.id)) {
        console.warn(`Skipping update for document ${args.document.id} - update already in progress`);
        return;
      }

      try {
        // Set update lock
        updateLocks.set(args.document.id, true);

        const draftContent = await config.onUpdateDocument({
          document: args.document,
          description: args.description,
          dataStream: args.dataStream,
          session: args.session,
        });

        if (args.session?.user?.id) {
          await saveDocument({
            id: args.document.id,
            title: args.document.title,
            content: draftContent,
            kind: config.kind,
            userId: args.session.user.id,
          });
        }
      } finally {
        // Always release the lock, even if there's an error
        updateLocks.delete(args.document.id);
      }
    },
  };
}

/*
 * Use this array to define the document handlers for each artifact kind.
 */
export const documentHandlersByArtifactKind: Array<DocumentHandler> = [
  textDocumentHandler,
  codeDocumentHandler,
  imageDocumentHandler,
  sheetDocumentHandler,
];

export const artifactKinds = ['text', 'code', 'image', 'sheet'] as const;
