import { smoothStream, streamText } from 'ai';
import { myProvider } from '@/lib/ai/providers';
import { createDocumentHandler } from '@/lib/artifacts/server';
import { updateDocumentPrompt } from '@/lib/ai/prompts';

/**
 * System prompt optimized for Claude to generate clean, well-structured text artifacts
 */
interface StreamDelta {
  readonly type: 'text-delta';
  readonly textDelta: string;
}

interface DataStreamWriter {
  writeData: (data: { type: string; content: string }) => void;
}

interface DocumentParams {
  readonly title: string;
  readonly dataStream: DataStreamWriter;
}

interface UpdateParams {
  readonly document: { content: string | null };
  readonly description: string;
  readonly dataStream: DataStreamWriter;
}

interface TextStreamOptions {
  readonly maxTokens?: number;
  readonly temperature?: number;
}

const CLAUDE_DOCUMENT_PROMPT = `
You are a professional content creator specializing in clear, well-structured documents.

Document Structure Rules:
1. Start with a single top-level heading (H1) using # for the document title
2. Use ## for main sections (H2)
3. Use ### for subsections (H3) when needed
4. Never use heading levels deeper than H3
5. Never use multiple H1 headings

Formatting Rules:
1. Use one blank line between paragraphs
2. Use two blank lines before each heading
3. Start new sentences with a single space
4. Use proper Markdown for:
   - Lists (-, *, or numbers)
   - Emphasis (*italic* or **bold**)
   - Code blocks (\`\`\`)
   - Links [text](url)

Content Guidelines:
1. Write clear, concise paragraphs
2. Avoid meta-commentary ("I have created", "I will", etc.)
3. Output content directly without wrapper text
4. Maintain professional tone
5. Include introduction before first H2
6. End with a conclusion

The user will provide a title or topic. Create high-quality content following these rules strictly.
`;

const CLAUDE_CHAT_PROMPT = `
You are a helpful AI assistant providing clear and informative responses.

Formatting Rules:
1. Start responses directly with the main content - no headings
2. Use proper Markdown for:
   - Lists (-, *, or numbers)
   - Emphasis (*italic* or **bold**)
   - Code blocks (\`\`\`)
   - Links [text](url)

Content Guidelines:
1. Write clear, concise paragraphs
2. Use lists for multiple points or steps
3. Maintain professional tone
4. Be direct and informative
5. Avoid unnecessary formatting
`;

interface TextStreamPart {
  type: 'text-delta';
  textDelta: string;
}

/**
 * Stream text content with improved formatting and structure
 */
function streamFormattedText({
  prompt,
  system = CLAUDE_DOCUMENT_PROMPT,
  isChat = false,
  options = {},
}: {
  prompt: string;
  system?: string;
  isChat?: boolean;
  options?: TextStreamOptions;
}) {
  return streamText({
    model: myProvider.languageModel('artifact-model'),
    system: isChat ? CLAUDE_CHAT_PROMPT : system,
    prompt,
    maxTokens: options.maxTokens ?? 20000,
    temperature: options.temperature ?? 0.7,
    // Direct streaming without transforms to prevent duplication
  });
}

import { processText } from '@/lib/utils';

export const textDocumentHandler = createDocumentHandler<'text'>({
  kind: 'text',
  onCreateDocument: async ({ title, dataStream }: DocumentParams) => {
    let draftContent = '';

    // Use the smallest possible chunking to maximize streaming responsiveness
const { fullStream } = streamText({
      model: myProvider.languageModel('artifact-model'),
      system: CLAUDE_DOCUMENT_PROMPT,
      prompt: `Create a well-structured document about: ${title}`,
      maxTokens: 4000,
      experimental_transform: smoothStream({ 
        chunking: 'word',
        delayInMs: 0
      })
    });

    // This will track the last streamed segment to prevent duplicates
    let previousChunk = '';
    let accumulatedContent = '';
    
    for await (const delta of fullStream) {
      if (delta.type === 'text-delta') {
        const { textDelta } = delta as StreamDelta;
        
        // Add to accumulated draft content for final processing
        draftContent += textDelta;
        
        // CRITICAL FIX: Instead of streaming raw deltas which may contain duplicates,
        // we ensure only the new part of the content is sent
        accumulatedContent += textDelta;
        
        // Only stream the new content (avoiding duplication)
        // We buffer a small amount to ensure we don't split words incorrectly
        const contentToStream = accumulatedContent;
        accumulatedContent = '';
        
        // Don't stream empty content
        if (contentToStream.length > 0) {
          // Stream the non-duplicated content to the client
          dataStream.writeData({
            type: 'text-delta',
            content: contentToStream,
          });
          
          // Store this chunk for future de-duplication
          previousChunk = contentToStream;
          
          // Log for debugging
          console.log(`[TextDocumentHandler] Streaming clean delta:`, {
            contentLength: contentToStream.length,
            preview: contentToStream.substring(0, 20) + (contentToStream.length > 20 ? '...' : ''),
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    // Process the final content to ensure proper document structure
    return processText(draftContent, {
      preserveNewlines: true,
      preserveMarkdownHeadings: true
    });
  },
  onUpdateDocument: async ({ document, description, dataStream }: UpdateParams) => {
    let draftContent = '';

    const { fullStream } = streamFormattedText({
      prompt: `Update the following document based on this request: ${description}

Current document:
${document.content ?? ''}

Provide the complete updated document while maintaining its structure and quality.`,
      system: CLAUDE_DOCUMENT_PROMPT,
      options: {
        maxTokens: 20000,
        temperature: 0.7,
      },
    });

    for await (const delta of fullStream) {
      if (delta.type === 'text-delta') {
        const { textDelta } = delta as TextStreamPart;
        draftContent += textDelta;
        
        // Immediately stream each delta to the client without processing
        // This ensures real-time streaming with minimal latency
        dataStream.writeData({
          type: 'text-delta',
          content: textDelta,
        });
        
        // Log streaming activity for debugging
        console.log(`[TextDocumentHandler] Streaming update delta:`, {
          deltaLength: textDelta.length,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Process the final content to ensure proper document structure
    return processText(draftContent, {
      preserveNewlines: true,
      preserveMarkdownHeadings: true
    });
  },
});
