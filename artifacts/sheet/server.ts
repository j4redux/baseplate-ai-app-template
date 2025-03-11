import { myProvider } from '@/lib/ai/providers';
import { sheetPrompt, updateDocumentPrompt } from '@/lib/ai/prompts';
import { createDocumentHandler } from '@/lib/artifacts/server';
import { streamObject, streamText } from 'ai';
import { z } from 'zod';

/**
 * System prompt optimized for Claude to generate clean, well-structured spreadsheets
 */
const CLAUDE_SHEET_SYSTEM_PROMPT = `
You are a data specialist creating high-quality spreadsheets in CSV format.

When creating spreadsheets:
- Use clear, descriptive column headers
- Include appropriate data types for each column
- Organize data logically
- Ensure data is well-formatted and consistent
- Include a reasonable number of rows (5-15) with realistic sample data
- Use comma as the delimiter between values
- Escape commas within text fields with double quotes
- Do not include formatting or formulas
- Return only valid CSV data
- Ensure each row has the same number of columns
- Do not include explanations or markdown formatting in your response

The user will provide a description of the spreadsheet they need. Create a high-quality CSV that meets their requirements.
`;

/**
 * Helper function to extract CSV content from Claude's response
 * @param content - The raw content from the model
 * @returns Cleaned CSV content
 */
function extractCSVContent(content: string): string {
  // Check if the content is wrapped in markdown code blocks
  const codeBlockRegex = /```(?:csv)?\n([\s\S]+?)\n```/g;
  const matches = content.match(codeBlockRegex);
  
  if (matches && matches.length > 0) {
    // Extract the CSV from the first code block
    const firstMatch = matches[0];
    const csvContent = firstMatch.replace(/```(?:csv)?\n([\s\S]+?)\n```/g, '$1');
    return csvContent.trim();
  }
  
  // If no code blocks found, try to extract CSV by looking for lines with commas
  const lines = content.split('\n');
  const csvLines = lines.filter(line => 
    // More robust CSV line detection
    (line.includes(',') && !line.startsWith('#') && !line.startsWith('//') && 
     !line.trim().startsWith('Here') && !line.trim().startsWith('This') && 
     !line.trim().startsWith('I') && !line.trim().startsWith('The'))
  );
  
  if (csvLines.length > 0) {
    return csvLines.join('\n');
  }
  
  // If all else fails, return the original content
  return content;
}

export const sheetDocumentHandler = createDocumentHandler<'sheet'>({
  kind: 'sheet',
  onCreateDocument: async ({ title, dataStream }) => {
    let draftContent = '';
    let completeCSVSent = false;

    // Use streamText for better compatibility with Claude
    const { fullStream } = streamText({
      model: myProvider.languageModel('artifact-model'),
      system: CLAUDE_SHEET_SYSTEM_PROMPT,
      prompt: `Create a CSV spreadsheet for: ${title}`,
      // Explicitly set max tokens to ensure we get complete responses
      maxTokens: 4000,
    });

    let buffer = '';
    const flushInterval = 200; // Larger buffer for CSV data to ensure complete rows
    
    // Track when we've received the header row
    let headerReceived = false;
    
    for await (const delta of fullStream) {
      const { type } = delta;

      if (type === 'text-delta') {
        const { textDelta } = delta;
        
        // Enhanced space detection and insertion logic for CSV content
        // Only apply to non-CSV data (explanatory text) as we don't want to break CSV format
        if (textDelta.length > 0 && draftContent.length > 0 && !headerReceived) {
          // Check if we need to add a space between segments
          const needsSpace = (
            // Last character of current content is alphanumeric or punctuation that shouldn't end a sentence
            /[a-zA-Z0-9,:;\-_\(\[{]$/.test(draftContent) && 
            // First character of new delta is alphanumeric or punctuation that shouldn't start a sentence
            /^[a-zA-Z0-9\)\]},]/.test(textDelta) &&
            // Current content doesn't already end with whitespace
            !draftContent.endsWith(' ') && 
            !draftContent.endsWith('\n') && 
            !draftContent.endsWith('\t') &&
            // New delta doesn't start with whitespace
            !textDelta.startsWith(' ') && 
            !textDelta.startsWith('\n') &&
            !textDelta.startsWith('\t')
          );
          
          if (needsSpace) {
            draftContent += ' ';
            buffer += ' ';
          }
        }
        
        draftContent += textDelta;
        buffer += textDelta;
        
        // Check if we've received the header row
        if (!headerReceived && buffer.includes('\n')) {
          headerReceived = true;
        }
        
        // Only send complete chunks that contain full CSV rows
        if (buffer.length >= flushInterval && buffer.includes('\n') && !completeCSVSent) {
          // Find the last newline to ensure we don't split in the middle of a row
          const lastNewline = buffer.lastIndexOf('\n');
          if (lastNewline !== -1) {
            const completeChunk = buffer.substring(0, lastNewline + 1);
            const partialCSV = extractCSVContent(completeChunk);
            
            if (partialCSV.trim().length > 0) {
              dataStream.writeData({
                type: 'sheet-delta',
                content: partialCSV,
              });
            }
            
            buffer = buffer.substring(lastNewline + 1);
          }
        }
      }
    }
    
    // Process any remaining content in the buffer
    if (buffer.length > 0 && !completeCSVSent) {
      const partialCSV = extractCSVContent(buffer);
      if (partialCSV.trim().length > 0) {
        dataStream.writeData({
          type: 'sheet-delta',
          content: partialCSV,
        });
      }
    }
    
    // Process the complete content and send as final update
    const finalCSV = extractCSVContent(draftContent);
    
    // Send the final complete CSV content
    dataStream.writeData({
      type: 'sheet-delta',
      content: finalCSV,
      complete: true
    });
    completeCSVSent = true;

    return draftContent;
  },
  onUpdateDocument: async ({ document, description, dataStream }) => {
    let draftContent = '';
    let completeCSVSent = false;

    // Create a custom system prompt for Claude that includes the update instructions
    const claudeUpdatePrompt = `
${CLAUDE_SHEET_SYSTEM_PROMPT}

You are updating an existing spreadsheet. Here is the current CSV content:

${document.content}

Make the requested changes while maintaining good data structure and quality.
Return the complete updated CSV, not just the changes.
Ensure all rows have the same number of columns as the header row.
Do not include any explanations or markdown formatting in your response.
`;

    // Use streamText for better compatibility with Claude
    const { fullStream } = streamText({
      model: myProvider.languageModel('artifact-model'),
      system: claudeUpdatePrompt,
      prompt: description,
      // Explicitly set max tokens to ensure we get complete responses
      maxTokens: 4000,
    });

    let buffer = '';
    const flushInterval = 200; // Larger buffer for CSV data to ensure complete rows
    
    // Track when we've received the header row
    let headerReceived = false;
    
    for await (const delta of fullStream) {
      const { type } = delta;

      if (type === 'text-delta') {
        const { textDelta } = delta;
        
        // Enhanced space detection and insertion logic for CSV content
        // Only apply to non-CSV data (explanatory text) as we don't want to break CSV format
        if (textDelta.length > 0 && draftContent.length > 0 && !headerReceived) {
          // Check if we need to add a space between segments
          const needsSpace = (
            // Last character of current content is alphanumeric or punctuation that shouldn't end a sentence
            /[a-zA-Z0-9,:;\-_\(\[{]$/.test(draftContent) && 
            // First character of new delta is alphanumeric or punctuation that shouldn't start a sentence
            /^[a-zA-Z0-9\)\]},]/.test(textDelta) &&
            // Current content doesn't already end with whitespace
            !draftContent.endsWith(' ') && 
            !draftContent.endsWith('\n') && 
            !draftContent.endsWith('\t') &&
            // New delta doesn't start with whitespace
            !textDelta.startsWith(' ') && 
            !textDelta.startsWith('\n') &&
            !textDelta.startsWith('\t')
          );
          
          if (needsSpace) {
            draftContent += ' ';
            buffer += ' ';
          }
        }
        
        draftContent += textDelta;
        buffer += textDelta;
        
        // Check if we've received the header row
        if (!headerReceived && buffer.includes('\n')) {
          headerReceived = true;
        }
        
        // Only send complete chunks that contain full CSV rows
        if (buffer.length >= flushInterval && buffer.includes('\n') && !completeCSVSent) {
          // Find the last newline to ensure we don't split in the middle of a row
          const lastNewline = buffer.lastIndexOf('\n');
          if (lastNewline !== -1) {
            const completeChunk = buffer.substring(0, lastNewline + 1);
            const partialCSV = extractCSVContent(completeChunk);
            
            if (partialCSV.trim().length > 0) {
              dataStream.writeData({
                type: 'sheet-delta',
                content: partialCSV,
              });
            }
            
            buffer = buffer.substring(lastNewline + 1);
          }
        }
      }
    }
    
    // Process any remaining content in the buffer
    if (buffer.length > 0 && !completeCSVSent) {
      const partialCSV = extractCSVContent(buffer);
      if (partialCSV.trim().length > 0) {
        dataStream.writeData({
          type: 'sheet-delta',
          content: partialCSV,
        });
      }
    }
    
    // Process the complete content and send as final update
    const finalCSV = extractCSVContent(draftContent);
    
    // Send the final complete CSV content
    dataStream.writeData({
      type: 'sheet-delta',
      content: finalCSV,
      complete: true
    });
    completeCSVSent = true;

    return draftContent;
  },
});
