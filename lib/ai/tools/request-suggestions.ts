import { z } from 'zod';
import { Session } from 'next-auth';
import { DataStreamWriter, streamObject, tool } from 'ai';
import { getDocumentById, saveSuggestions } from '@/lib/db/queries';
import { Suggestion } from '@/lib/db/schema';
import { generateUUID } from '@/lib/utils';
import { myProvider } from '../providers';

const SUGGESTION_CATEGORIES = [
  'clarity',
  'grammar',
  'structure',
  'organization',
  'flow',
] as const;

const SUGGESTION_IMPACTS = [
  'high',
  'medium',
  'low',
] as const;

type SuggestionCategory = typeof SUGGESTION_CATEGORIES[number];
type SuggestionImpact = typeof SUGGESTION_IMPACTS[number];

interface SuggestionMetadata {
  readonly category: SuggestionCategory;
  readonly impact: SuggestionImpact;
  readonly messageIndex: number | null;
}

interface RequestSuggestionsProps {
  readonly session: Session;
  readonly dataStream: DataStreamWriter;
}

export const requestSuggestions = ({
  session,
  dataStream,
}: RequestSuggestionsProps) =>
  tool({
    description: 'Request suggestions for a document',
    parameters: z.object({
      documentId: z
        .string()
        .describe('The ID of the document to request edits'),
    }),
    execute: async ({ documentId }) => {
      const document = await getDocumentById({ id: documentId });

      if (!document || !document.content) {
        return {
          error: 'Document not found',
        };
      }

      const suggestions: Array<
        Omit<Suggestion, 'userId' | 'createdAt' | 'documentCreatedAt'>
      > = [];

      const { elementStream } = streamObject({
        model: myProvider.languageModel('artifact-model'),
        system: `
You are a writing improvement assistant. Analyze the text and provide targeted suggestions for enhancement. Follow these guidelines:

Suggestion Structure:
1. Focus on complete sentences and paragraphs
2. Maintain message boundaries and context
3. Respect existing formatting and style
4. Preserve document structure

Suggestion Types:
- Clarity improvements
- Grammar and style fixes
- Structure enhancements
- Content organization
- Flow improvements

Rules:
1. Maximum 5 suggestions
2. Each suggestion must be self-contained
3. Provide complete sentences, not fragments
4. Include clear before/after examples
5. Explain the rationale for each change
`,
        prompt: document.content,
        output: 'array',
        schema: z.object({
          originalText: z.string().describe('The original text to be improved'),
          suggestedText: z.string().describe('The suggested improvement'),
          description: z.string().describe('Detailed explanation of the improvement'),
          messageIndex: z.number().nullable().describe('Index of the message containing this text (if applicable)'),
          category: z.enum(SUGGESTION_CATEGORIES as unknown as [string, ...string[]]).describe('Type of improvement being suggested'),
          impact: z.enum(SUGGESTION_IMPACTS as unknown as [string, ...string[]]).describe('Impact level of this suggestion'),
        }),
      });

      for await (const element of elementStream) {
        const suggestion = {
          originalText: element.originalText,
          suggestedText: element.suggestedText,
          description: element.description,
          category: element.category,
          impact: element.impact,
          messageIndex: element.messageIndex ?? null,
          id: generateUUID(),
          documentId: documentId,
          isResolved: false,
        };

        dataStream.writeData({
          type: 'suggestion',
          content: suggestion,
        });

        suggestions.push(suggestion);
      }

      if (session.user?.id) {
        const userId = session.user.id;

        await saveSuggestions({
          suggestions: suggestions.map((suggestion) => ({
            ...suggestion,
            userId,
            createdAt: new Date(),
            documentCreatedAt: document.createdAt,
          })),
        });
      }

      return {
        id: documentId,
        title: document.title,
        kind: document.kind,
        message: 'Suggestions have been added to the document',
      };
    },
  });
