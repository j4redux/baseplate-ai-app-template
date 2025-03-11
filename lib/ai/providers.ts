import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { isTestEnvironment } from '../constants';
import {
  artifactModel,
  chatModel,
  reasoningModel,
  titleModel,
} from './models.test';

/**
 * Custom AI provider configuration for the application.
 * In test environment, uses mock models from models.test.
 * In production environment, uses a combination of Anthropic and OpenAI models:
 *
 * Anthropic Models:
 * - Reasoning: Claude 3.7 Sonnet - Latest version for advanced reasoning and hybrid thinking
 * - Large Model: Claude 3.5 Sonnet - Latest version for general large-scale tasks
 * - Artifact Model: Claude 3.5 Sonnet - Latest version for generating and processing artifacts
 * - Small Model: Claude 3.5 Haiku - Latest version for quick, lightweight tasks
 *
 * OpenAI Models:
 * - Title Model: GPT-4 Turbo - For generating concise, accurate titles
 * - Image Models: DALL-E 2/3 - For image generation and manipulation
 *
 * Note: All Anthropic models use the '-latest' tag to automatically stay updated
 * with the most recent model versions while maintaining consistent performance.
 */
export const myProvider = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model-small': chatModel,
        'chat-model-large': chatModel,
        'chat-model-reasoning': reasoningModel,
        'title-model': titleModel,
        'artifact-model': artifactModel,
      },
    })
  : customProvider({
      languageModels: {
        'chat-model-small': anthropic('claude-3-5-haiku-latest'),
        'chat-model-large': anthropic('claude-3-7-sonnet-latest'),
        'chat-model-reasoning': wrapLanguageModel({
          model: anthropic('claude-3-7-sonnet-latest'),
          middleware: extractReasoningMiddleware({ tagName: 'think' }),
        }),
        'title-model': openai('gpt-4-turbo'),
        'artifact-model': anthropic('claude-3-7-sonnet-latest'),
      },
      imageModels: {
        'small-model': openai.image('dall-e-2'),
        'large-model': openai.image('dall-e-3'),
      },
    });
