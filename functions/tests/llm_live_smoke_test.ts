/**
 * Real LLM Live Integration Smoke Test Script
 * 
 * Verifies live API communication with configured LLM Provider (e.g., Groq).
 * Does NOT hardcode API keys. Reads environment variables from .env or process.env.
 * 
 * Usage:
 *   npx tsx functions/tests/llm_live_smoke_test.ts
 */

import fs from 'fs'
import path from 'path'

// Helper to load .env file manually without external dependencies
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env')
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8')
    for (const line of envConfig.split('\n')) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=')
        const val = valueParts.join('=').trim()
        if (key && !process.env[key.trim()]) {
          process.env[key.trim()] = val
        }
      }
    }
  }
}

loadEnv()

async function runLiveLLMSmokeTest() {
  console.log('\n═══════════════════════════════════════════════════')
  console.log(' Live LLM Integration Smoke Test (Groq / Gemini / OpenRouter)')
  console.log('═══════════════════════════════════════════════════\n')

  const apiKey = process.env.LLM_API_KEY || process.env.GROQ_API_KEY
  const provider = process.env.LLM_PROVIDER || 'groq'
  const model = process.env.LLM_MODEL || 'llama-3.3-70b-versatile'
  const endpoint = process.env.LLM_ENDPOINT || 'https://api.groq.com/openai/v1/chat/completions'

  if (!apiKey || apiKey === 'your_llm_api_key_here') {
    console.error('❌ Error: LLM_API_KEY is not set or contains default placeholder.')
    console.error('Please configure your valid LLM_API_KEY in .env before running live smoke test.')
    process.exit(1)
  }

  // Mask API key for logging
  const maskedKey = apiKey.slice(0, 4) + '...' + apiKey.slice(-4)
  console.log(`[Config] Provider: ${provider}`)
  console.log(`[Config] Model: ${model}`)
  console.log(`[Config] Endpoint: ${endpoint}`)
  console.log(`[Config] API Key: ${maskedKey} (Masked)`)
  console.log('\nDispatching test completion request to provider...')

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a system verification assistant.' },
          { role: 'user', content: 'Say strictly: "Groq LLM Integration Verified!"' }
        ],
        temperature: 0.1,
        max_tokens: 30
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ HTTP Error ${response.status}: ${errorText}`)
      process.exit(1)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content?.trim() || ''
    const usage = data.usage || {}

    console.log('\n  ✅ Live LLM Response Received:')
    console.log(`  > "${content}"`)
    console.log(`  Tokens Used: ${usage.total_tokens || usage.completion_tokens || 'N/A'}`)
    console.log('\n═══════════════════════════════════════════════════')
    console.log(' Live LLM Integration Smoke Test: PASSED')
    console.log('═══════════════════════════════════════════════════\n')
  } catch (err: any) {
    console.error(`❌ Connection Error: ${err.message}`)
    process.exit(1)
  }
}

runLiveLLMSmokeTest()
