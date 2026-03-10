import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import OpenAI from 'openai';
import { eq } from 'drizzle-orm';
import { posts, usageLogs } from '@xhs/db';
import { createRequestLogger } from '@xhs/logger';
import type { ApiResponse, GeneratedContent, GenerateRequest } from '@xhs/shared';

// ── System Prompt ─────────────────────────────────────────────────────────────

const XHS_SYSTEM_PROMPT = `You are an expert 小红书 (Xiaohongshu / XHS) social media manager with 5+ years of experience creating viral, authentic content. You speak like a real Chinese user — not a textbook.

YOUR PERSONA: A stylish, relatable Chinese content creator in their 20s–30s. You use internet slang naturally (yyds, 绝绝子, 种草, 拔草, 太上头了, etc.). You write from experience, not observation.

OUTPUT FORMAT — STRICT RULES:
Return ONLY valid JSON matching this exact structure:
{
  "title": "...",
  "body": "...",
  "hashtags": [...],
  "category_tags": [...],
  "tone_check": "..."
}

Title Rules (标题):
- Max 20 Chinese characters
- Must open with a hook: question, surprising fact, or relatable situation
- No punctuation at end
- Examples: "在巴黎街头我哭了", "这家餐厅救了我的出差", "终于找到平价好用的底妆"

Body Rules (正文):
- 150–500 Chinese characters total
- Start with a 1-2 line personal hook (first-person, emotional)  
- Use short paragraphs (2-4 lines max each)
- Insert relevant emojis naturally (not at every line — 5-10 total feels authentic)
- End with a question or call-to-action to drive comments
- Line breaks: use \\n between paragraphs
- Write like texting a friend, not writing an essay

Hashtag Rules (话题标签):
- 3–8 hashtags
- Mix: 1-2 broad popular tags + 2-3 specific niche tags + 1 trend tag
- Return WITHOUT # prefix (the UI adds it)
- Examples: ["巴黎旅行", "法国生活", "海外留学", "欧洲穷游攻略", "旅行vlog"]

Category Tags: 2-4 tags that describe the content type for XHS algorithm

WHAT TO AVOID:
- Never sound like a translation (no "此外" "综上所述" "总的来说")
- No superlatives violating XHS policy ("全网最好", "第一名", "No.1")  
- No external platform mentions (Instagram, YouTube, TikTok, WeChat)
- No medical/legal/financial claims
- No political content
- No direct competitor comparisons
- Avoid overly formal 书面语

TONE VARIANTS:
- warm: 温暖治愈系, like sharing with a close friend
- aspirational: 精致生活感, subtle flex, makes reader want to upgrade
- informative: 干货分享, useful tips first, personal touch second
- funny: 搞笑吐槽向, self-deprecating humor, relatable fails`;

// ── Content safety check ──────────────────────────────────────────────────────

const BLOCKED_PATTERNS = [
  /全网最好/,
  /第一名/,
  /No\.1/i,
  /Instagram|YouTube|TikTok|WeChat/i,
  /此外|综上所述|总的来说/,
];

function contentSafetyCheck(content: { title: string; body: string }): boolean {
  const combined = `${content.title} ${content.body}`;
  return !BLOCKED_PATTERNS.some((pattern) => pattern.test(combined));
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

const GenerateRequestSchema = z.object({
  inputText: z
    .string()
    .min(1, 'Input text is required')
    .max(1000, 'Input text must not exceed 1000 characters'),
  inputLanguage: z.string().default('en'),
  category: z.enum(['travel', 'food', 'lifestyle', 'beauty', 'fashion', 'tech', 'other']),
  tone: z.enum(['warm', 'aspirational', 'informative', 'funny']),
});

// ── LLM response schema ───────────────────────────────────────────────────────

const LlmOutputSchema = z.object({
  title: z.string().max(30), // Some tolerance on length
  body: z.string(),
  hashtags: z.array(z.string()),
  category_tags: z.array(z.string()),
  tone_check: z.string(),
});

// ── OpenAI client factory (lazy) ──────────────────────────────────────────────

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY environment variable is required');
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

const DEFAULT_MODEL = 'gpt-4o';
const INPUT_COST_PER_1K = 0.005; // USD per 1K tokens (gpt-4o)
const OUTPUT_COST_PER_1K = 0.015;

// ── Routes ────────────────────────────────────────────────────────────────────

export const generateRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/generate
  app.post(
    '/generate',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const traceId = (request as any).traceId as string;
      const { log } = createRequestLogger('generate', traceId);

      // Validate request
      const parsed = GenerateRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        const response: ApiResponse<never> = {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message ?? 'Validation failed',
            field: parsed.error.errors[0]?.path.join('.'),
          },
          traceId,
        };
        return reply.code(400).send(response);
      }

      const { inputText, inputLanguage, category, tone } = parsed.data;
      const userId = request.user.id;
      const model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;

      log.info({ userId, category, tone, chars: inputText.length }, 'Starting generation');

      // Build user prompt
      const userPrompt = `Content to localize for XHS:
---
Language: ${inputLanguage}
Category: ${category}
Tone: ${tone}
Content: ${inputText}
---
Transform this into an authentic XHS post. DO NOT translate directly. Reimagine it as a Chinese content creator who experienced this would write it. Return valid JSON only.`;

      // Call OpenAI with retry on invalid JSON
      let llmOutput: z.infer<typeof LlmOutputSchema> | null = null;
      let tokensUsed = 0;
      let rawResponse = '';

      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const completion = await getOpenAI().chat.completions.create({
            model,
            messages: [
              { role: 'system', content: XHS_SYSTEM_PROMPT },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.8,
            max_tokens: 1024,
            response_format: { type: 'json_object' },
          });

          tokensUsed =
            (completion.usage?.prompt_tokens ?? 0) +
            (completion.usage?.completion_tokens ?? 0);
          rawResponse = completion.choices[0]?.message?.content ?? '';

          if (!rawResponse) {
            throw new Error('Empty response from LLM');
          }

          const jsonParsed = JSON.parse(rawResponse);
          const validated = LlmOutputSchema.safeParse(jsonParsed);

          if (!validated.success) {
            log.warn(
              { attempt, errors: validated.error.errors },
              'LLM output failed schema validation, retrying',
            );
            if (attempt === 2) throw new Error('LLM returned invalid JSON structure');
            continue;
          }

          llmOutput = validated.data;
          break;
        } catch (err: any) {
          if (attempt === 2) {
            log.error({ err: err.message, traceId }, 'LLM generation failed after retries');
            const response: ApiResponse<never> = {
              ok: false,
              error: {
                code: 'LLM_ERROR',
                message: 'Failed to generate content. Please try again.',
              },
              traceId,
            };
            return reply.code(502).send(response);
          }
          log.warn({ attempt, err: err.message }, 'LLM attempt failed, retrying');
        }
      }

      if (!llmOutput) {
        const response: ApiResponse<never> = {
          ok: false,
          error: { code: 'LLM_ERROR', message: 'Failed to generate content' },
          traceId,
        };
        return reply.code(502).send(response);
      }

      // Content safety check
      const isSafe = contentSafetyCheck({ title: llmOutput.title, body: llmOutput.body });
      if (!isSafe) {
        log.warn({ traceId }, 'Content safety check failed');
        const response: ApiResponse<never> = {
          ok: false,
          error: {
            code: 'LLM_ERROR',
            message: 'Generated content did not pass safety check. Please try again.',
          },
          traceId,
        };
        return reply.code(422).send(response);
      }

      // Save draft post to DB
      const [post] = await app.db
        .insert(posts)
        .values({
          userId,
          inputText,
          inputLanguage,
          category,
          tone,
          generatedTitle: llmOutput.title,
          generatedBody: llmOutput.body,
          generatedHashtags: llmOutput.hashtags,
          generatedCategoryTags: llmOutput.category_tags,
          status: 'draft',
          generationModel: model,
          generationTokens: tokensUsed,
        })
        .returning();

      // Log usage
      const inputTokens = Math.floor(tokensUsed * 0.6);
      const outputTokens = tokensUsed - inputTokens;
      const costEstimate =
        (inputTokens / 1000) * INPUT_COST_PER_1K +
        (outputTokens / 1000) * OUTPUT_COST_PER_1K;

      await app.db.insert(usageLogs).values({
        userId,
        actionType: 'generate_content',
        tokensUsed,
        modelUsed: model,
        costEstimate,
        traceId,
      });

      log.info({ userId, postId: post.id, tokensUsed }, 'Generation complete');

      const generatedContent: GeneratedContent = {
        title: llmOutput.title,
        body: llmOutput.body,
        hashtags: llmOutput.hashtags,
        categoryTags: llmOutput.category_tags,
        toneCheck: llmOutput.tone_check as GeneratedContent['toneCheck'],
        model,
        tokensUsed,
      };

      const response: ApiResponse<{ postId: string; content: GeneratedContent }> = {
        ok: true,
        data: { postId: post.id, content: generatedContent },
        traceId,
      };
      return reply.code(200).send(response);
    },
  );
};
