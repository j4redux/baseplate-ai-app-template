import { z } from 'zod';
import { streamText } from 'ai';
import type { JSONValue } from 'ai';
import { myProvider } from '@/lib/ai/providers';
import { codePrompt, updateDocumentPrompt } from '@/lib/ai/prompts';
import { createDocumentHandler } from '@/lib/artifacts/server';

/**
 * System prompt optimized for Claude to generate clean, well-structured code artifacts
 * with proper language identification
 */
const CLAUDE_CODE_SYSTEM_PROMPT = `
You are an expert programmer creating high-quality code examples.

When writing code:
- Create complete, self-contained, executable code
- Follow best practices and coding standards
- Include clear comments explaining the code's purpose and logic
- Use proper indentation and formatting
- Organize code logically with appropriate function/method names
- Handle potential errors gracefully
- Avoid unnecessary dependencies
- Ensure the code is efficient and optimized
- Include example usage that demonstrates functionality

IMPORTANT FORMATTING INSTRUCTIONS:
1. Always start your response with the language name on the first line, followed by a newline. For example:
   "python" or "javascript" or "java" etc.
2. Then provide the code directly after that. You must follow these rules:
   - NO markdown formatting or code blocks (do not use \`\`\` or any other markdown)
   - NO additional explanations or text outside the code
   - NO formatting symbols or decorators
   - Just pure, clean code with proper indentation

Example of correct format:

python
def hello_world():
    print("Hello, world!")

hello_world()

The user will provide a description of the code they need. Create high-quality code that meets their requirements.
`;

/**
 * Interface for the processed code output
 */
interface ProcessedCode {
  readonly language: NonNullable<SupportedLanguage>;
  readonly code: string;
}

/**
 * Helper function to clean up code output from Claude
 * Extracts language information and code content, handling various formats
 * @param content - The raw content from the model
 * @returns Processed code with language and content
 */
type SupportedLanguage = 
  | 'text'
  | 'python'
  | 'javascript'
  | 'jsx'
  | 'typescript'
  | 'java'
  | 'cpp';

const DEFAULT_LANGUAGE: SupportedLanguage = 'text';





interface CodeState {
  readonly language: NonNullable<SupportedLanguage>;
  readonly code: string;
  readonly buffer: string;
  readonly hasLanguage: boolean;
}

interface CodeDelta extends Record<string, unknown> {
  readonly type: 'code-delta';
  readonly content: string;
  readonly complete?: boolean;
}

type CodeDeltaMessage = CodeDelta & { [key: string]: JSONValue };



function processCodeOutput(content: string): ProcessedCode {
  if (!content) {
    return { language: DEFAULT_LANGUAGE, code: '' };
  }
  let state: CodeState = {
    language: DEFAULT_LANGUAGE,
    code: content,
    buffer: '',
    hasLanguage: false,
  };

  // Helper to update state immutably
  const updateState = (updates: Partial<CodeState>): void => {
    state = { ...state, ...updates };
  };

  // Early return for empty content
  if (!content?.trim()) {
    return { language: state.language, code: '' };
  }
  
  // Helper to check if a string is a valid language
  const isValidLanguage = (lang: string): lang is SupportedLanguage => {
    const validLanguages = [
      'text', 'python', 'javascript', 'jsx', 'typescript', 'java', 'cpp'
    ] as const;
    return validLanguages.includes(lang as SupportedLanguage);
  };



  // First, check if the content follows our expected format (language on first line)
  const lines = content.trim().split('\n');
  if (lines.length > 1) {
    const firstLine = lines[0].trim().toLowerCase();
    // Check if the first line is a valid language identifier
    if (isValidLanguage(firstLine)) {
      updateState({
        language: firstLine,
        code: lines.slice(1).join('\n').trim()
      });
      return { language: state.language, code: state.code };
    }
  }
  
  // Check if the content is wrapped in markdown code blocks
  const codeBlockRegex = /```([a-z]+(\-?[a-z0-9]+)*)\n([\s\S]+?)\n```/g;
  const match = codeBlockRegex.exec(content);
  
  if (match && match.length >= 4) {
    // Extract language and code from the code block
    const detectedLang = match[1].toLowerCase();
    if (isValidLanguage(detectedLang)) {
      updateState({
        language: detectedLang,
        code: match[3].trim()
      });
      return { language: state.language, code: state.code };
    }
  }
  
  // Handle partial code blocks (when streaming hasn't completed yet)
  if (content.includes('```')) {
    const parts = content.split('```');
    if (parts.length >= 2) {
      // Try to extract language from the opening marker
      const langMatch = parts[1].match(/^([a-z]+(\-?[a-z0-9]+)*)\n/);
      if (langMatch && langMatch.length >= 2) {
        const detectedLang = langMatch[1].toLowerCase();
        if (isValidLanguage(detectedLang)) {
          updateState({
            language: detectedLang,
            code: parts[1].replace(/^[a-z]+(\-?[a-z0-9]+)*\n/, '').trim()
          });
          return { language: state.language, code: state.code };
        }
      }
      
      // If no language specified, just get the content
      updateState({ code: parts[1].trim() });
    }
  }
  
  // Helper to detect language from code patterns
  const detectLanguage = (input: string): NonNullable<SupportedLanguage> => {
    if (!input) return DEFAULT_LANGUAGE;
    const patterns: ReadonlyArray<[RegExp, SupportedLanguage]> = [
      [/def\s+.*:\s*(?!.*;)/, 'python'],
      [/import\s+React|useState|from\s+['"]react['"]/, 'jsx'],
      [/function.*{.*}|console\.log/, 'javascript'],
      [/interface\s+|type\s+|:\s*string/, 'typescript'],
      [/(?:public|private)\s+class/, 'java'],
      [/#include/, 'cpp']
    ];

    return patterns.find(([pattern]) => pattern.test(input))?.[1] ?? 'text';
  };

  updateState({ language: detectLanguage(state.code) });
  
  // Clean up any remaining markdown formatting
  const cleanCode = (input: string): string => {
    const cleaners: ReadonlyArray<[RegExp, string]> = [
      [/^#+\s+.*$/gm, ''],      // Remove markdown headers
      [/\*\*|__/g, ''],         // Remove bold formatting
      [/\*|_/g, ''],            // Remove italic formatting
      [/```[a-z]*\n?/g, ''],    // Remove code block markers
      [/^[-\s]*$/gm, '']        // Remove separator lines
    ];

    return cleaners.reduce(
      (cleaned, [pattern, replacement]) => cleaned.replace(pattern, replacement),
      input
    ).trim();
  };

  updateState({ code: cleanCode(state.code) });
  
  return { language: state.language, code: state.code };
}



export const codeDocumentHandler = createDocumentHandler<'code'>({
  kind: 'code',
  onCreateDocument: async ({ title, dataStream }) => {
    let draftContent = '';
    let detectedLanguage: SupportedLanguage = DEFAULT_LANGUAGE;
    let completeCodeSent = false;
    
    // Use streamText for better compatibility with Claude
    const { fullStream } = streamText({
      model: myProvider.languageModel('artifact-model'),
      system: CLAUDE_CODE_SYSTEM_PROMPT,
      prompt: `Create code for: ${title}

IMPORTANT: Your response must be PURE CODE with NO markdown formatting. Do not use code blocks (\`\`\`) or any other markdown syntax. Start with the language name on the first line, then the code.`,
      // Explicitly set max tokens to ensure we get complete responses
      maxTokens: 4000,
    });

    // Use a larger buffer for collecting complete code blocks
    let buffer = '';
    const flushInterval = 150; // Smaller buffer for more responsive streaming
    
    // Track when we've received a significant amount of content
    let significantContentReceived = false;
    const significantContentThreshold = 300; // Characters
    
    // Track if we've detected and sent the language information
    let languageDetected = false;
    
    for await (const delta of fullStream) {
      const { type } = delta;

      if (type === 'text-delta' && delta.textDelta) {
        const textDelta = delta.textDelta;
        
        // Add the new content to our buffers
        draftContent += textDelta;
        buffer += textDelta;
        
        // Try to detect language as early as possible
        if (!languageDetected && draftContent.length > 20) {
          // Process the current content to extract language and code
          const processed = processCodeOutput(draftContent);
          const processedLanguage = processed.language;
          
          // If we've detected a valid language, update the client
          if (processedLanguage && processedLanguage !== 'text') {
            detectedLanguage = processedLanguage;
            languageDetected = true;
            // Send language information to client
            const languageDelta: CodeDeltaMessage = {
              type: 'code-delta',
              content: `language:${detectedLanguage}\n`,
            };
            dataStream.writeData(languageDelta);
            
            // Reset buffers to start with clean code content
            buffer = '';
            draftContent = processed.code;
          }
        }
        
        // Check if we've received a significant amount of content
        if (!significantContentReceived && draftContent.length > significantContentThreshold) {
          significantContentReceived = true;
        }
        
        // Process in chunks to avoid choppy output
        if (buffer.length >= flushInterval && !completeCodeSent) {
          // Only send code content after language has been detected
          if (languageDetected) {
            const codeDelta: CodeDeltaMessage = {
              type: 'code-delta',
              content: buffer,
            };
            dataStream.writeData(codeDelta);
            buffer = '';
          }
        }
      }
    }
    
    // Send any remaining buffered content
    if (buffer.length > 0 && !completeCodeSent && languageDetected) {
      const codeDelta: CodeDeltaMessage = {
        type: 'code-delta',
        content: buffer,
      };
      dataStream.writeData(codeDelta as JSONValue);
    }
    
    // Process the final content to ensure we have the correct language and clean code
    const processedFinal = processCodeOutput(draftContent);
    detectedLanguage = processedFinal.language;
    const cleanedCode = processedFinal.code;
    
    // If language wasn't detected earlier, send it now
    if (!languageDetected) {
      const finalDelta: CodeDeltaMessage = {
        type: 'code-delta',
        content: `language:${detectedLanguage}\n${cleanedCode}`,
        complete: true,
      };
      dataStream.writeData({ ...finalDelta } as JSONValue);
    } else {
      // Send the complete, cleaned code as a final update
      const cleanedDelta: CodeDeltaMessage = {
        type: 'code-delta',
        content: cleanedCode,
        complete: true,
      };
      dataStream.writeData({ ...cleanedDelta } as JSONValue);
    }
    completeCodeSent = true;

    return cleanedCode;
  },
  onUpdateDocument: async ({ document, description, dataStream }) => {
    let draftContent = '';
    let detectedLanguage: SupportedLanguage = DEFAULT_LANGUAGE;
    let completeCodeSent = false;

    // Try to extract language from existing document content
    // This helps maintain the same language during updates
    const existingContent = document.content ?? '';
    const existingProcessed = processCodeOutput(existingContent);
    const existingLanguage = existingProcessed.language;
    if (existingLanguage) {
      detectedLanguage = existingLanguage;
    }

    // Create a custom system prompt for Claude that includes the update instructions
    const claudeUpdatePrompt = `
${CLAUDE_CODE_SYSTEM_PROMPT}

You are updating existing code. Here is the current code:

${existingProcessed.code}

Make the requested changes while maintaining good code structure and quality.
Return the complete updated code, not just the changes.
Ensure you maintain the same programming language: ${detectedLanguage}
`;

    // Use streamText for better compatibility with Claude
    const { fullStream } = streamText({
      model: myProvider.languageModel('artifact-model'),
      system: claudeUpdatePrompt,
      prompt: description,
      // Explicitly set max tokens to ensure we get complete responses
      maxTokens: 4000,
    });

    // Use a buffer for collecting code chunks
    let buffer = '';
    const flushInterval = 150; // Smaller buffer for more responsive streaming
    
    // Track when we've received a significant amount of content
    let significantContentReceived = false;
    const significantContentThreshold = 300; // Characters
    
    // Track if we've sent the language information
    let languageSent = false;
    
    for await (const delta of fullStream) {
      const { type } = delta;

      if (type === 'text-delta' && delta.textDelta) {
        const textDelta = delta.textDelta;
        
        // Add the new content to our buffers
        draftContent += textDelta;
        buffer += textDelta;
        
        // Send language information at the beginning of the stream
        if (!languageSent && draftContent.length > 0) {
          languageSent = true;
          // Send language information to client
          const langDelta: CodeDelta = {
            type: 'code-delta',
            content: `language:${detectedLanguage}\n`,
          };
          dataStream.writeData(langDelta as JSONValue);
          buffer = ''; // Reset buffer after sending language
        }
        
        // Check if we've received a significant amount of content
        if (!significantContentReceived && draftContent.length > significantContentThreshold) {
          significantContentReceived = true;
        }
        
        // Process in chunks to avoid choppy output
        if (buffer.length >= flushInterval && !completeCodeSent && languageSent) {
          dataStream.writeData({
            type: 'code-delta',
            content: buffer,
          });
          buffer = '';
        }
      }
    }
    
    // Send any remaining buffered content
    if (buffer.length > 0 && !completeCodeSent && languageSent) {
      const codeDelta: CodeDeltaMessage = {
        type: 'code-delta',
        content: buffer,
      };
      dataStream.writeData(codeDelta as JSONValue);
    }
    
    // Process the final content to ensure we have clean code
    // We maintain the original language but clean up the code
    const processedFinal = processCodeOutput(draftContent);
    const cleanedCode = processedFinal.code;
    
    // Send the complete, cleaned code as a final update
    dataStream.writeData({
      type: 'code-delta',
      content: cleanedCode,
      complete: true
    });
    completeCodeSent = true;

    return cleanedCode;
  },
});
