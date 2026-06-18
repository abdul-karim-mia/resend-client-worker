// AI model constants extracted to a separate file to maintain React Fast Refresh compatibility.
// Fast Refresh requires component files to ONLY export React components.

export const AI_MODELS = [
  // ── Fast (great for auto-reply, low latency) ─────────────────────────────
  {
    id: '@cf/meta/llama-3.2-3b-instruct',
    name: 'Llama 3.2 3B',
    badge: 'Default',
    category: 'Fast',
    description: 'Smallest model, lowest latency. Ideal for drafts & auto-reply.',
  },
  {
    id: '@cf/mistral/mistral-7b-instruct-v0.2',
    name: 'Mistral 7B v0.2',
    badge: '',
    category: 'Fast',
    description: 'Efficient 7B model with strong instruction following.',
  },
  {
    id: '@cf/google/gemma-3-4b-it',
    name: 'Gemma 3 4B',
    badge: '',
    category: 'Fast',
    description: "Google's compact Gemma 3 model. Fast and capable.",
  },

  // ── Balanced (quality + reasonable speed) ────────────────────────────────
  {
    id: '@cf/google/gemma-3-12b-it',
    name: 'Gemma 3 12B',
    badge: '',
    category: 'Balanced',
    description: "Google's 12B Gemma 3. Strong comprehension and tone.",
  },
  {
    id: '@cf/qwen/qwen2.5-7b-instruct',
    name: 'Qwen 2.5 7B',
    badge: '',
    category: 'Balanced',
    description: 'Alibaba Qwen 2.5 — strong multilingual support.',
  },

  // ── Powerful (max quality, higher latency) ───────────────────────────────
  {
    id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    name: 'Llama 3.3 70B FP8',
    badge: 'Best Quality',
    category: 'Powerful',
    description: 'Top-tier quality with FP8 quantization for speed. Best for complex emails.',
  },
  {
    id: '@cf/google/gemma-3-27b-it',
    name: 'Gemma 3 27B',
    badge: '',
    category: 'Powerful',
    description: "Google's largest Gemma 3. Excellent for nuanced writing.",
  },
  {
    id: '@cf/qwen/qwen2.5-coder-32b-instruct',
    name: 'Qwen 2.5 Coder 32B',
    badge: '',
    category: 'Powerful',
    description: 'Best for technical/developer support emails with code.',
  },

  // ── Reasoning (step-by-step analysis) ───────────────────────────────────
  {
    id: '@cf/deepseek-ai/deepseek-r1-distill-llama-70b',
    name: 'DeepSeek R1 70B',
    badge: 'Reasoning',
    category: 'Reasoning',
    description: 'Chain-of-thought reasoning. Best for complex problem analysis.',
  },
  {
    id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
    name: 'DeepSeek R1 Qwen 32B',
    badge: 'Reasoning',
    category: 'Reasoning',
    description: 'Reasoning model distilled into Qwen 32B. Fast + smart.',
  },
] as const

export const AI_MODEL_CATEGORIES = ['Fast', 'Balanced', 'Powerful', 'Reasoning'] as const

export const BADGE_COLORS: Record<string, string> = {
  Default:        'var(--accent)',
  Fastest:        '#10b981',
  Popular:        '#f59e0b',
  'Best Quality': '#8b5cf6',
  Reasoning:      '#3b82f6',
}
