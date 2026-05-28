import { Logger } from '@nestjs/common';
import { EngineResult } from './faq.engine';

const logger = new Logger('AiEngine');

export interface AiConfig {
  provider?: string;
  model?: string;
  api_key?: string;
  system_prompt?: string;
}

export interface ContextMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function callAi(
  text: string,
  cfg: AiConfig,
  context: ContextMessage[] = [],
): Promise<EngineResult | null> {
  if (!cfg.api_key) {
    logger.warn({ event: 'ai_no_api_key' });
    return null;
  }

  const provider = cfg.provider ?? 'claude';

  try {
    if (provider === 'claude') {
      return await callClaude(text, cfg, context);
    }
    logger.warn({ event: 'ai_unknown_provider', provider });
    return null;
  } catch (err) {
    logger.warn({ event: 'ai_call_error', err: String(err) });
    return null;
  }
}

async function callClaude(
  text: string,
  cfg: AiConfig,
  context: ContextMessage[],
): Promise<EngineResult> {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic.default({ apiKey: cfg.api_key });

  const messages = [
    ...context.slice(-6).map(m => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: text },
  ];

  const response = await client.messages.create({
    model: cfg.model ?? 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: cfg.system_prompt || 'You are a helpful customer support bot. Be concise and helpful.',
    messages,
  });

  const answer = response.content?.[0]?.text ?? '';
  return { answer, confidence: 0.9 };
}
