import { WorkflowStep } from '../types'

export interface LLMConfig {
  provider?: string
  model?: string
  system_prompt?: string
  prompt?: string
  temperature?: number
  max_tokens?: number
}

function interpolateVariables(template: string, context: Record<string, any>): string {
  if (!template) return ''
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const parts = path.split('.')
    let current: any = context
    for (const part of parts) {
      if (current === undefined || current === null) return ''
      current = current[part]
    }
    return current !== undefined && current !== null ? String(current) : ''
  })
}

export async function executeLLMCall(
  step: WorkflowStep,
  stepInput: Record<string, any>,
  executionHistory: Record<string, any> = {}
): Promise<{ text: string; provider: string; model: string; usage?: any }> {
  const config: LLMConfig = step.config || {}
  const provider = config.provider || process.env.LLM_PROVIDER || 'groq'
  const model = config.model || process.env.LLM_MODEL || 'llama-3.3-70b-versatile'
  const temperature = config.temperature ?? 0.2
  const maxTokens = config.max_tokens ?? 500

  const contextData = { input: stepInput, ...executionHistory }
  const rawPrompt = config.prompt || stepInput.prompt || 'Hello, summarize the input task.'
  const interpolatedPrompt = interpolateVariables(rawPrompt, contextData)
  const systemPrompt = interpolateVariables(config.system_prompt || 'You are a helpful AI workflow assistant.', contextData)

  const apiKey = process.env.LLM_API_KEY || process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY
  const isDevMock = process.env.ENGINE_DEV_MOCK === 'true'

  if (apiKey && !isDevMock) {
    // Call real LLM Provider endpoint (e.g. Groq OpenAI compatible endpoint)
    const endpoint = process.env.LLM_ENDPOINT || 'https://api.groq.com/openai/v1/chat/completions'
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: interpolatedPrompt }
        ],
        temperature,
        max_tokens: maxTokens
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`LLM Provider HTTP ${response.status}: ${errText}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''
    return {
      text: content,
      provider,
      model,
      usage: data.usage || { prompt_tokens: 0, completion_tokens: 0 }
    }
  }

  // Development mode fallback when no LLM_API_KEY is configured
  console.warn('[LLM Step] No LLM_API_KEY configured. Returning explicitly marked dev stub response.')
  const mockText = `[DEV STUB: LLM_API_KEY unconfigured] Simulated completion for prompt: "${interpolatedPrompt}". Sentiment status: positive.`
  return {
    text: mockText,
    provider: 'dev-stub-unconfigured',
    model,
    usage: { prompt_tokens: 15, completion_tokens: 28, total_tokens: 43 }
  }
}
