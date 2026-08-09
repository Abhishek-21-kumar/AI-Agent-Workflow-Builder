import { WorkflowStep } from '../types'

export interface HTTPConfig {
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: any
  timeout_ms?: number
}

function interpolateVariables(val: any, context: Record<string, any>): any {
  if (typeof val === 'string') {
    return val.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
      const parts = path.split('.')
      let current: any = context
      for (const part of parts) {
        if (current === undefined || current === null) return ''
        current = current[part]
      }
      return current !== undefined && current !== null ? String(current) : ''
    })
  }
  if (typeof val === 'object' && val !== null) {
    if (Array.isArray(val)) {
      return val.map(item => interpolateVariables(item, context))
    }
    const res: Record<string, any> = {}
    for (const key of Object.keys(val)) {
      res[key] = interpolateVariables(val[key], context)
    }
    return res
  }
  return val
}

export async function executeHTTPRequest(
  step: WorkflowStep,
  stepInput: Record<string, any>,
  executionHistory: Record<string, any> = {}
): Promise<{ status: number; status_text: string; data: any; headers: Record<string, string> }> {
  const config: HTTPConfig = step.config || {}
  const method = (config.method || 'GET').toUpperCase()
  const rawUrl = config.url || stepInput.url

  if (!rawUrl) {
    throw new Error('HTTP Request Step Error: Missing URL configuration.')
  }

  const contextData = { input: stepInput, ...executionHistory }
  const urlString = interpolateVariables(rawUrl, contextData)

  // Validate URL protocol (prevent file://, ftp://, javascript: etc.)
  let parsedUrl: URL
  try {
    parsedUrl = new URL(urlString)
  } catch {
    throw new Error(`HTTP Request Error: Invalid URL format "${urlString}"`)
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(`HTTP Request Security Error: Unsupported protocol "${parsedUrl.protocol}". Only http: and https: are allowed.`)
  }

  const timeoutMs = config.timeout_ms || 10000

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    ...(config.headers ? interpolateVariables(config.headers, contextData) : {})
  }

  let body: string | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    const rawBody = config.body || stepInput.body
    if (rawBody) {
      const interpolatedBody = interpolateVariables(rawBody, contextData)
      body = typeof interpolatedBody === 'string' ? interpolatedBody : JSON.stringify(interpolatedBody)
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json'
      }
    }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(urlString, {
      method,
      headers,
      body,
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    const resHeaders: Record<string, string> = {}
    response.headers.forEach((val, key) => {
      resHeaders[key] = val
    })

    const contentType = response.headers.get('content-type') || ''
    let responseData: any
    if (contentType.includes('application/json')) {
      responseData = await response.json()
    } else {
      responseData = await response.text()
    }

    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status} (${response.statusText}): ${typeof responseData === 'string' ? responseData : JSON.stringify(responseData)}`)
    }

    // Sanitize authorization headers in recorded output
    const safeRequestHeaders = { ...headers }
    delete safeRequestHeaders['authorization']
    delete safeRequestHeaders['Authorization']

    return {
      status: response.status,
      status_text: response.statusText,
      data: responseData,
      headers: resHeaders
    }
  } catch (err: any) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      throw new Error(`HTTP Request Timed Out after ${timeoutMs}ms`)
    }
    throw err
  }
}
