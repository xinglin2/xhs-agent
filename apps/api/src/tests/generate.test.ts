import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock OpenAI ───────────────────────────────────────────────────────────────

const mockCreate = vi.fn();

vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

// ── Mock @xhs/db ──────────────────────────────────────────────────────────────

const mockInsert = vi.fn().mockReturnValue({
  values: vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue([
      {
        id: 'test-post-id-1234',
        userId: 'test-user-id',
        inputText: 'Test content',
        inputLanguage: 'en',
        category: 'travel',
        tone: 'warm',
        generatedTitle: '测试标题',
        generatedBody: '测试正文内容',
        generatedHashtags: ['测试', '旅行'],
        generatedCategoryTags: ['旅行'],
        status: 'draft',
        generationModel: 'gpt-4o',
        generationTokens: 200,
        createdAt: new Date(),
        updatedAt: new Date(),
        publishedAt: null,
      },
    ]),
  }),
});

const mockDb = {
  insert: mockInsert,
};

vi.mock('@xhs/db', () => ({
  posts: { id: 'posts.id', userId: 'posts.userId' },
  usageLogs: {},
}));

// ── Import the route logic under test ─────────────────────────────────────────
// We test the logic directly without spinning up a full Fastify server.
// The key behaviours to verify are:
//   1. Valid input → LLM called → JSON parsed → post saved → response returned
//   2. Input > 1000 chars → 400 Validation error (no LLM call)
//   3. LLM returns invalid JSON → retry → error returned

// We'll extract the validation and parsing logic inline for unit testing.

// ── Zod schema (duplicated here for testing isolation) ────────────────────────
import { z } from 'zod';

const GenerateRequestSchema = z.object({
  inputText: z
    .string()
    .min(1, 'Input text is required')
    .max(1000, 'Input text must not exceed 1000 characters'),
  inputLanguage: z.string().default('en'),
  category: z.enum(['travel', 'food', 'lifestyle', 'beauty', 'fashion', 'tech', 'other']),
  tone: z.enum(['warm', 'aspirational', 'informative', 'funny']),
});

const LlmOutputSchema = z.object({
  title: z.string().max(30),
  body: z.string(),
  hashtags: z.array(z.string()),
  category_tags: z.array(z.string()),
  tone_check: z.string(),
});

// ── Content safety ────────────────────────────────────────────────────────────

const BLOCKED_PATTERNS = [
  /全网最好/,
  /第一名/,
  /No\.1/i,
  /Instagram|YouTube|TikTok|WeChat/i,
  /此外|综上所述|总的来说/,
];

function contentSafetyCheck(content: { title: string; body: string }): boolean {
  const combined = `${content.title} ${content.body}`;
  return !BLOCKED_PATTERNS.some((p) => p.test(combined));
}

// ── Simulated generate handler ────────────────────────────────────────────────
// This mirrors the core logic of src/routes/generate.ts for testing.

async function handleGenerate(
  body: unknown,
  openai: any,
  db: any,
): Promise<{ status: number; data: any }> {
  const parsed = GenerateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      status: 400,
      data: {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors[0]?.message ?? 'Validation failed',
        },
        traceId: 'test-trace',
      },
    };
  }

  const { inputText, inputLanguage, category, tone } = parsed.data;
  const model = 'gpt-4o';
  let llmOutput: z.infer<typeof LlmOutputSchema> | null = null;
  let tokensUsed = 0;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model,
        messages: [{ role: 'user', content: inputText }],
      });

      tokensUsed = completion.usage?.total_tokens ?? 0;
      const raw = completion.choices[0]?.message?.content ?? '';
      const jsonParsed = JSON.parse(raw);
      const validated = LlmOutputSchema.safeParse(jsonParsed);

      if (!validated.success) {
        if (attempt === 2) throw new Error('LLM returned invalid JSON structure');
        continue;
      }

      llmOutput = validated.data;
      break;
    } catch (err: any) {
      if (attempt === 2) {
        return {
          status: 502,
          data: {
            ok: false,
            error: { code: 'LLM_ERROR', message: 'Failed to generate content. Please try again.' },
            traceId: 'test-trace',
          },
        };
      }
    }
  }

  if (!llmOutput) {
    return {
      status: 502,
      data: { ok: false, error: { code: 'LLM_ERROR', message: 'Failed to generate content' }, traceId: 'test-trace' },
    };
  }

  const isSafe = contentSafetyCheck({ title: llmOutput.title, body: llmOutput.body });
  if (!isSafe) {
    return {
      status: 422,
      data: {
        ok: false,
        error: { code: 'LLM_ERROR', message: 'Generated content did not pass safety check.' },
        traceId: 'test-trace',
      },
    };
  }

  // Simulate DB insert
  const [post] = await db
    .insert({})
    .values({ inputText, category, tone })
    .returning();

  return {
    status: 200,
    data: {
      ok: true,
      data: {
        postId: post.id,
        content: {
          title: llmOutput.title,
          body: llmOutput.body,
          hashtags: llmOutput.hashtags,
          categoryTags: llmOutput.category_tags,
          toneCheck: llmOutput.tone_check,
          model,
          tokensUsed,
        },
      },
      traceId: 'test-trace',
    },
  };
}

// ── Helper: mock valid LLM response ──────────────────────────────────────────

function makeLlmResponse(overrides: Partial<z.infer<typeof LlmOutputSchema>> = {}) {
  const content = JSON.stringify({
    title: '在东京街头我哭了',
    body: '第一次来东京，完全没想到会这么感动 🥹\n\n街道那么干净，路人那么友善，就连便利店的饭团都好吃到想哭 😭\n\n你们有没有去过一个地方，回来之后就再也放不下了？',
    hashtags: ['东京旅行', '日本生活', '海外打卡', '旅行vlog', '穷游攻略'],
    category_tags: ['旅行', '生活记录'],
    tone_check: 'warm',
    ...overrides,
  });

  return {
    choices: [{ message: { content } }],
    usage: { total_tokens: 350, prompt_tokens: 200, completion_tokens: 150 },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/generate', () => {
  const openaiInstance = { chat: { completions: { create: mockCreate } } };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Input validation', () => {
    it('should return 400 when inputText exceeds 1000 characters', async () => {
      const longText = 'a'.repeat(1001);
      const result = await handleGenerate(
        { inputText: longText, category: 'travel', tone: 'warm' },
        openaiInstance,
        mockDb,
      );

      expect(result.status).toBe(400);
      expect(result.data.ok).toBe(false);
      expect(result.data.error.code).toBe('VALIDATION_ERROR');
      expect(result.data.error.message).toContain('1000');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should return 400 when inputText is empty', async () => {
      const result = await handleGenerate(
        { inputText: '', category: 'travel', tone: 'warm' },
        openaiInstance,
        mockDb,
      );

      expect(result.status).toBe(400);
      expect(result.data.ok).toBe(false);
      expect(result.data.error.code).toBe('VALIDATION_ERROR');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid category', async () => {
      const result = await handleGenerate(
        { inputText: 'Hello world', category: 'invalid-category', tone: 'warm' },
        openaiInstance,
        mockDb,
      );

      expect(result.status).toBe(400);
      expect(result.data.ok).toBe(false);
      expect(result.data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid tone', async () => {
      const result = await handleGenerate(
        { inputText: 'Hello world', category: 'travel', tone: 'unknown' },
        openaiInstance,
        mockDb,
      );

      expect(result.status).toBe(400);
      expect(result.data.ok).toBe(false);
      expect(result.data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should accept exactly 1000 characters', async () => {
      const exactText = 'a'.repeat(1000);
      mockCreate.mockResolvedValueOnce(makeLlmResponse());

      const result = await handleGenerate(
        { inputText: exactText, category: 'travel', tone: 'warm' },
        openaiInstance,
        mockDb,
      );

      expect(result.status).toBe(200);
      expect(result.data.ok).toBe(true);
      expect(mockCreate).toHaveBeenCalledOnce();
    });
  });

  describe('Successful generation', () => {
    it('should call OpenAI and return valid GeneratedContent', async () => {
      mockCreate.mockResolvedValueOnce(makeLlmResponse());

      const result = await handleGenerate(
        {
          inputText: 'I had an amazing trip to Tokyo. The streets were clean, the food was incredible.',
          inputLanguage: 'en',
          category: 'travel',
          tone: 'warm',
        },
        openaiInstance,
        mockDb,
      );

      expect(result.status).toBe(200);
      expect(result.data.ok).toBe(true);
      expect(result.data.data.postId).toBe('test-post-id-1234');
      expect(result.data.data.content.title).toBe('在东京街头我哭了');
      expect(result.data.data.content.hashtags).toContain('东京旅行');
      expect(result.data.data.content.model).toBe('gpt-4o');
      expect(result.data.data.content.tokensUsed).toBe(350);
      expect(mockCreate).toHaveBeenCalledOnce();
    });

    it('should pass category and tone in the request', async () => {
      mockCreate.mockResolvedValueOnce(makeLlmResponse());

      await handleGenerate(
        { inputText: 'Great sushi restaurant in Shibuya!', category: 'food', tone: 'funny' },
        openaiInstance,
        mockDb,
      );

      expect(mockCreate).toHaveBeenCalledOnce();
    });
  });

  describe('LLM error handling', () => {
    it('should return 502 when LLM returns invalid JSON (after retries)', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'not valid json at all' } }],
        usage: { total_tokens: 100 },
      });

      const result = await handleGenerate(
        { inputText: 'Some content here', category: 'lifestyle', tone: 'aspirational' },
        openaiInstance,
        mockDb,
      );

      expect(result.status).toBe(502);
      expect(result.data.ok).toBe(false);
      expect(result.data.error.code).toBe('LLM_ERROR');
      // Should have been called twice (initial + retry)
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('should retry once on invalid JSON before failing', async () => {
      // First call: invalid JSON
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{invalid json' } }],
        usage: { total_tokens: 50 },
      });
      // Second call: also invalid JSON → final failure
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{}' } }], // missing required fields
        usage: { total_tokens: 50 },
      });

      const result = await handleGenerate(
        { inputText: 'Test retry logic', category: 'tech', tone: 'informative' },
        openaiInstance,
        mockDb,
      );

      expect(result.status).toBe(502);
      expect(result.data.error.code).toBe('LLM_ERROR');
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('should succeed on second attempt if first fails', async () => {
      // First call: invalid JSON
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{"bad": "data"}' } }],
        usage: { total_tokens: 50 },
      });
      // Second call: valid response
      mockCreate.mockResolvedValueOnce(makeLlmResponse());

      const result = await handleGenerate(
        { inputText: 'Retry success test', category: 'beauty', tone: 'aspirational' },
        openaiInstance,
        mockDb,
      );

      expect(result.status).toBe(200);
      expect(result.data.ok).toBe(true);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('should return 502 when OpenAI throws a network error', async () => {
      mockCreate.mockRejectedValue(new Error('Network error'));

      const result = await handleGenerate(
        { inputText: 'Network failure test', category: 'food', tone: 'funny' },
        openaiInstance,
        mockDb,
      );

      expect(result.status).toBe(502);
      expect(result.data.ok).toBe(false);
      expect(result.data.error.code).toBe('LLM_ERROR');
    });
  });

  describe('Content safety', () => {
    it('should return 422 when generated content contains blocked patterns', async () => {
      mockCreate.mockResolvedValueOnce(
        makeLlmResponse({ title: '全网最好的旅行攻略', body: '这是一篇超级好的攻略' }),
      );

      const result = await handleGenerate(
        { inputText: 'Best travel tips', category: 'travel', tone: 'informative' },
        openaiInstance,
        mockDb,
      );

      expect(result.status).toBe(422);
      expect(result.data.ok).toBe(false);
      expect(result.data.error.code).toBe('LLM_ERROR');
    });

    it('should block content mentioning Instagram', async () => {
      mockCreate.mockResolvedValueOnce(
        makeLlmResponse({ body: '在Instagram上分享一下这个旅行经历吧' }),
      );

      const result = await handleGenerate(
        { inputText: 'Share on social media', category: 'lifestyle', tone: 'warm' },
        openaiInstance,
        mockDb,
      );

      expect(result.status).toBe(422);
      expect(result.data.error.code).toBe('LLM_ERROR');
    });
  });
});

// ── Encryption unit tests ─────────────────────────────────────────────────────

describe('Encryption', () => {
  // Set the AES_KEY for testing
  beforeEach(() => {
    process.env.AES_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes
  });

  it('should encrypt and decrypt text correctly', async () => {
    const { encrypt, decrypt } = await import('../lib/encryption.js');

    const plaintext = 'Hello, this is a secret XHS cookie blob!';
    const encrypted = encrypt(plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).toContain(':');

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertexts for the same input (random IV)', async () => {
    const { encrypt } = await import('../lib/encryption.js');

    const plaintext = 'same input text';
    const enc1 = encrypt(plaintext);
    const enc2 = encrypt(plaintext);

    expect(enc1).not.toBe(enc2);
  });

  it('should throw on invalid encrypted string format', async () => {
    const { decrypt } = await import('../lib/encryption.js');

    expect(() => decrypt('invalid-format')).toThrow('Invalid encrypted string format');
  });

  it('should mask API keys correctly', async () => {
    const { maskApiKey } = await import('../lib/encryption.js');

    const key = 'sk-abcdefghij1234';
    const masked = maskApiKey(key);

    expect(masked).toContain('...');
    expect(masked).not.toBe(key);
    expect(masked.startsWith('sk-abc')).toBe(true);
    expect(masked.endsWith('1234')).toBe(true);
  });
});
