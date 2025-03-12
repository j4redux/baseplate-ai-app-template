import type {
  CoreAssistantMessage,
  CoreToolMessage,
  Message,
  TextStreamPart,
  ToolInvocation,
  ToolSet,
} from 'ai';

interface TextProcessingOptions {
  readonly preserveNewlines?: boolean;
  readonly preserveSpaces?: boolean;
  readonly preserveMarkdownHeadings?: boolean;
}

// Helper function to ensure temperature values are properly formatted with bold markdown
// This ensures consistent formatting of temperature values with proper spacing
export function formatTemperatures(text: string): string {
  // First, make sure we fix any spacing issues with temperature values
  let result = text
    // Fix spacing in temperatures with decimal points (e.g., "15. 9°C" -> "15.9°C")
    .replace(/(\d+)\.(\s*)(\d+)(\s*)°([CF])/g, '$1.$3°$5');
  
  // Handle temperature ranges (e.g., "10-11°C" -> "**10-11°C**")
  result = result.replace(/(\d+[\.\d]*)-(\d+[\.\d]*)°([CF])/g, '**$1-$2°$3**');
  
  // Handle regular temperature values (make sure not to process already formatted ranges)
  result = result
    .replace(/(?<!\*\*)\b(\d+\.\d+)°([CF])\b(?!\*\*)/g, '**$1°$2**')
    .replace(/(?<!\*\*)\b(\d+)°([CF])\b(?!\*\*)/g, '**$1°$2**');
    
  return result;
}

export function processText(text: string, options: TextProcessingOptions = {}): string {
  const { 
    preserveNewlines = false, 
    preserveSpaces = false,
    preserveMarkdownHeadings = false 
  } = options;
  
  // First, normalize all whitespace while preserving intentional newlines
  let processed = text
    .replace(/[\t\f\r ]+/g, ' ')
    .trim();

  if (preserveMarkdownHeadings) {
    // For documents, preserve markdown structure and formatting
    processed = processed
      // Normalize markdown headings
      .replace(/^(#{1,6})([^\s#])/gm, '$1 $2')
      // Ensure proper list formatting
      .replace(/^(\d+)\.(\s*)/gm, '$1. ')
      .replace(/^([*-])\s*/gm, '$1 ')
      // Preserve intentional line breaks
      .replace(/\n{3,}/g, '\n\n');
  } else {
    // For chat messages, simplify formatting
    processed = processed
      // Normalize lists without affecting other content
      .replace(/^(\d+)\.(\s*)/gm, '$1. ')
      .replace(/^([*-])\s*/gm, '$1 ');
    
    // Handle newlines
    if (!preserveNewlines) {
      // Convert all newlines to spaces if not preserving newlines
      processed = processed.replace(/\n+/g, ' ');
    }
    // When preserveNewlines is true, we leave the newlines intact
  }

  // Handle sentence spacing consistently
  if (preserveNewlines) {
    // When preserving newlines, only normalize spaces while keeping newlines intact
    processed = processed
      .replace(/([.!?])(?!["'.])/g, '$1 ')
      // Replace multiple spaces with a single space, but preserve newlines
      .replace(/[^\S\n]+/g, ' ')
      .trim();
  } else {
    // Standard whitespace normalization when not preserving newlines
    processed = processed
      .replace(/([.!?])(?!["'.])/g, '$1 ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  // Fix spacing issues in common technical terms with periods
  processed = processed
    .replace(/Next\. js/g, 'Next.js')
    .replace(/Node\. js/g, 'Node.js')
    .replace(/Type\. ?Script/g, 'TypeScript')
    .replace(/Java\. ?Script/g, 'JavaScript')
    .replace(/React\. ?js/g, 'React.js')
    .replace(/Vue\. ?js/g, 'Vue.js')
    .replace(/(\d+)\. (\d+)\. (\d+)/g, '$1.$2.$3'); // Fix version numbers like 1. 2. 3
    


  return processed;
}

interface MessageContent {
  readonly type: 'text' | 'tool-call' | 'tool-result' | 'reasoning';
  readonly text?: string;
  readonly toolCallId?: string;
  readonly toolName?: string;
  readonly args?: Record<string, unknown>;
  readonly reasoning?: string;
  readonly result?: unknown;
}
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

import type { Message as DBMessage, Document } from '@/lib/db/schema';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ApplicationError extends Error {
  info: string;
  status: number;
}

export const fetcher = async (url: string) => {
  const res = await fetch(url);

  if (!res.ok) {
    const error = new Error(
      'An error occurred while fetching the data.',
    ) as ApplicationError;

    error.info = await res.json();
    error.status = res.status;

    throw error;
  }

  return res.json();
};

export function getLocalStorage(key: string) {
  if (typeof window !== 'undefined') {
    return JSON.parse(localStorage.getItem(key) || '[]');
  }
  return [];
}

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function addToolMessageToChat({
  toolMessage,
  messages,
}: {
  toolMessage: CoreToolMessage;
  messages: Array<Message>;
}): Array<Message> {
  return messages.map((message) => {
    if (message.toolInvocations) {
      return {
        ...message,
        toolInvocations: message.toolInvocations.map((toolInvocation) => {
          const toolResult = toolMessage.content.find(
            (tool) => tool.toolCallId === toolInvocation.toolCallId,
          );

          if (toolResult) {
            return {
              ...toolInvocation,
              state: 'result',
              result: toolResult.result,
            };
          }

          return toolInvocation;
        }),
      };
    }

    return message;
  });
}

export function convertToUIMessages(
  messages: readonly DBMessage[],
): Message[] {
  // First pass: process messages normally
  const processedMessages = messages.reduce<Message[]>((chatMessages, message) => {
    if (message.role === 'tool') {
      return addToolMessageToChat({
        toolMessage: message as CoreToolMessage,
        messages: chatMessages,
      });
    }

    const processContent = (content: MessageContent[]): {
      text: string;
      reasoning?: string;
      toolInvocations: ToolInvocation[];
    } => {
      const textParts: string[] = [];
      const toolInvocations: ToolInvocation[] = [];
      let reasoning: string | undefined;

      // Process text parts first to ensure complete sentences before tool calls
      const processedText = content
        .filter((part): part is MessageContent & { type: 'text'; text: string } =>
          part.type === 'text' && typeof part.text === 'string'
        )
        .map(part => processText(part.text, {
          preserveNewlines: true,
          preserveMarkdownHeadings: true,
          preserveSpaces: true
        }))
        .join('\n\n');
      
      // Process tool calls and reasoning after text is properly formatted
      content.forEach((part) => {
        switch (part.type) {
          case 'tool-call':
            if (part.toolCallId && part.toolName) {
              toolInvocations.push({
                state: 'call',
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                args: part.args ?? {},
              });
            }
            break;
          case 'reasoning':
            if (part.reasoning) {
              reasoning = part.reasoning;
            }
            break;
        }
      });

      const text = processedText;

      return { text, reasoning, toolInvocations };
    };

    const { text, reasoning, toolInvocations } = typeof message.content === 'string'
      ? { 
          text: processText(message.content, {
            preserveNewlines: true,
            preserveMarkdownHeadings: true,
            preserveSpaces: true
          }), 
          reasoning: undefined, 
          toolInvocations: [] 
        }
      : processContent(message.content as MessageContent[]);

    chatMessages.push({
      id: message.id,
      role: message.role as Message['role'],
      content: text,
      reasoning,
      toolInvocations,
    });

    return chatMessages;
  }, []);

  // Second pass: identify and merge document-related messages
  const result: Message[] = [];
  let i = 0;

  while (i < processedMessages.length) {
    const current = processedMessages[i];
    
    // Check if this is an assistant message that might be part of a document flow
    if (current.role === 'assistant') {
      // Look ahead to see if the next message is also from the assistant and contains document tools
      const next = i < processedMessages.length - 1 ? processedMessages[i + 1] : null;
      
      // Check if we should merge these messages (both are assistant messages and one has document tools)
      const shouldMerge = next && 
                          next.role === 'assistant' && 
                          (hasDocumentTools(current) || hasDocumentTools(next));
      
      if (shouldMerge) {
        // Create a merged message
        const mergedMessage: Message = {
          ...current,
          content: combineContent(current.content, next.content),
          toolInvocations: [
            ...(current.toolInvocations || []),
            ...(next.toolInvocations || [])
          ]
        };
        
        result.push(mergedMessage);
        i += 2; // Skip the next message since we merged it
      } else {
        // No need to merge, add the current message as is
        result.push(current);
        i++;
      }
    } else {
      // Not an assistant message, add as is
      result.push(current);
      i++;
    }
  }

  return result;
}

// Helper function to check if a message has document-related tool invocations
function hasDocumentTools(message: Message): boolean {
  return message.toolInvocations?.some(tool => 
    ['createDocument', 'updateDocument'].includes(tool.toolName)
  ) || false;
}

// Helper function to combine content from two messages with consistent formatting
function combineContent(content1: string, content2: string): string {
  if (!content1) return content2 || '';
  if (!content2) return content1 || '';
  
  // Normalize line breaks in both contents
  const normalizedContent1 = content1.trim().replace(/\n{3,}/g, '\n\n');
  const normalizedContent2 = content2.trim().replace(/\n{3,}/g, '\n\n');
  
  // Check for document creation patterns that should be kept on the same line
  const documentIntroPattern = /Let me create a document for you with a structured essay on this topic\./i;
  
  // If content2 starts with "I've created" and content1 ends with document intro,
  // we want to keep them on the same line for consistent formatting
  if (normalizedContent1.match(documentIntroPattern) && 
      normalizedContent2.trim().startsWith("I've created")) {
    // Join without paragraph break to match streaming format
    return normalizedContent1 + ' ' + normalizedContent2;
  }
  
  // For other cases, add proper spacing between contents
  return normalizedContent1 + (normalizedContent1.endsWith('\n\n') ? '' : '\n\n') + normalizedContent2;
}

type ResponseMessageWithoutId = CoreToolMessage | CoreAssistantMessage;
type ResponseMessage = ResponseMessageWithoutId & { id: string };

/**
 * Sanitizes response messages before saving to the database.
 * Ensures consistent formatting between streaming and post-refresh states.
 * This is critical for document display consistency in the UI.
 */
export function sanitizeResponseMessages({
  messages,
  reasoning,
}: {
  messages: Array<ResponseMessage>;
  reasoning: string | undefined;
}) {
  // Extract all valid tool result IDs to ensure complete tool chains
  const toolResultIds: Array<string> = [];
  const toolCallIds: Array<string> = [];

  // First pass: collect all tool call and result IDs
  for (const message of messages) {
    if (message.role === 'tool') {
      for (const content of message.content) {
        if (content.type === 'tool-result') {
          toolResultIds.push(content.toolCallId);
        }
      }
    } else if (message.role === 'assistant') {
      if (Array.isArray(message.content)) {
        for (const content of message.content) {
          if (content.type === 'tool-call') {
            toolCallIds.push(content.toolCallId);
          }
        }
      }
    }
  }

  // Process each message to ensure consistent format
  const messagesBySanitizedContent = messages.map((message) => {
    if (message.role !== 'assistant') return message;

    // Handle string content (should be preserved)
    if (typeof message.content === 'string') return message;

    // Filter content to ensure complete tool chains and valid text content
    const sanitizedContent = message.content.filter((content) =>
      content.type === 'tool-call'
        ? toolResultIds.includes(content.toolCallId) // Only keep tool calls with results
        : content.type === 'text'
          ? content.text.length > 0 // Only keep non-empty text
          : true, // Keep other content types as is
    );

    // Add reasoning if available (helps with UI context)
    if (reasoning) {
      // @ts-expect-error: reasoning message parts in sdk is wip
      sanitizedContent.push({ type: 'reasoning', reasoning });
    }

    return {
      ...message,
      content: sanitizedContent,
    };
  });

  // Only return messages with actual content
  return messagesBySanitizedContent.filter(
    (message) => message.content.length > 0,
  );
}

/**
 * Sanitizes messages for UI display to ensure consistent presentation.
 * This function is critical for maintaining document display consistency
 * between initial streaming and post-refresh states.
 */
export function sanitizeUIMessages(messages: Array<Message>): Array<Message> {
  // Simple approach: Identify consecutive assistant messages where the second message
  // contains document-related content and merge them together
  
  // Clone messages to avoid mutating the original array
  const result: Message[] = [];
  let skipNext = false;
  
  // Document-related patterns to identify document content in messages
  const documentPatterns = [
    /I('ve| have) created (a|an) .* document/i,
    /Would you like me to (help develop|update)/i,
    /Here('s| is) (what I'll cover|an outline|a draft)/i,
  ];
  
  for (let i = 0; i < messages.length; i++) {
    // Skip this message if it was already merged with a previous one
    if (skipNext) {
      skipNext = false;
      continue;
    }
    
    const message = messages[i];
    const nextMessage = i < messages.length - 1 ? messages[i + 1] : null;
    
    // Only consider merging assistant messages
    if (message.role !== 'assistant' || !nextMessage || nextMessage.role !== 'assistant') {
      result.push(message);
      continue;
    }
    
    // Check if either message contains document-related content
    const hasDocumentContent = documentPatterns.some(pattern => 
      pattern.test(message.content) || (nextMessage && pattern.test(nextMessage.content))
    );
    
    // Check if either message has document-related tool invocations
    const hasDocumentTool = 
      (message.toolInvocations?.some(inv => ['createDocument', 'updateDocument'].includes(inv.toolName))) ||
      (nextMessage?.toolInvocations?.some(inv => ['createDocument', 'updateDocument'].includes(inv.toolName)));
    
    // If this is a document-related message pair, merge them
    if (hasDocumentContent || hasDocumentTool) {
      // Combine content with proper spacing
      let combinedContent = message.content || '';
      if (nextMessage?.content && nextMessage.content.trim().length > 0) {
        if (combinedContent.length > 0 && !combinedContent.endsWith('\n\n')) {
          combinedContent += '\n\n';
        }
        combinedContent += nextMessage.content.trim();
      }
      
      // Combine tool invocations
      const combinedToolInvocations = [
        ...(message.toolInvocations || []),
        ...(nextMessage?.toolInvocations || [])
      ];
      
      // Create merged message
      result.push({
        ...message,
        content: combinedContent,
        toolInvocations: combinedToolInvocations
      });
      
      // Skip the next message since we've merged it
      skipNext = true;
    } else {
      // Not a document-related message, keep as is
      result.push(message);
    }
  }
  
  return result;
}

export function getMostRecentUserMessage(messages: Array<Message>) {
  const userMessages = messages.filter((message) => message.role === 'user');
  return userMessages.at(-1);
}

export function getDocumentTimestampByIndex(
  documents: Array<Document>,
  index: number,
) {
  if (!documents) return new Date();
  if (index > documents.length) return new Date();

  return documents[index].createdAt;
}
