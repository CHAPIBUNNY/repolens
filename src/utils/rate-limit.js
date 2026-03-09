/**
 * Rate Limiting for External APIs
 * 
 * Implements rate limiting and request throttling for Notion API and other services
 * to prevent abuse and respect API limits.
 */

/**
 * Rate limiter class using token bucket algorithm
 */
class RateLimiter {
  constructor(options = {}) {
    this.maxRequests = options.maxRequests || 3; // Notion: 3 requests per second
    this.timeWindow = options.timeWindow || 1000; // 1 second
    this.tokens = this.maxRequests;
    this.lastRefill = Date.now();
    this.queue = [];
  }
  
  /**
   * Refill tokens based on elapsed time
   */
  refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    
    if (elapsed >= this.timeWindow) {
      const tokensToAdd = Math.floor(elapsed / this.timeWindow) * this.maxRequests;
      this.tokens = Math.min(this.maxRequests, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }
  
  /**
   * Attempt to consume a token
   * @returns {boolean} True if token available, false otherwise
   */
  tryConsume() {
    this.refill();
    
    if (this.tokens > 0) {
      this.tokens--;
      return true;
    }
    
    return false;
  }
  
  /**
   * Wait for a token to become available
   * @returns {Promise<void>}
   */
  async waitForToken() {
    return new Promise((resolve) => {
      const attemptConsume = () => {
        if (this.tryConsume()) {
          resolve();
        } else {
          // Wait a bit and try again
          const waitTime = Math.max(50, (this.timeWindow / this.maxRequests) / 2);
          setTimeout(attemptConsume, waitTime);
        }
      };
      
      attemptConsume();
    });
  }
  
  /**
   * Execute a function with rate limiting
   * @param {Function} fn - Async function to execute
   * @returns {Promise<any>}
   */
  async execute(fn) {
    await this.waitForToken();
    return await fn();
  }
}

/**
 * Retry logic with exponential backoff
 */
class RetryPolicy {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.initialDelay = options.initialDelay || 1000; // 1 second
    this.maxDelay = options.maxDelay || 30000; // 30 seconds
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.retryableStatuses = options.retryableStatuses || [429, 500, 502, 503, 504];
  }
  
  /**
   * Execute function with retry logic
   * @param {Function} fn - Async function to execute
   * @param {object} context - Context for logging
   * @returns {Promise<any>}
   */
  async execute(fn, context = {}) {
    let lastError;
    let delay = this.initialDelay;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        // Check if error is retryable
        if (!this.shouldRetry(error, attempt)) {
          throw error;
        }
        
        // Log retry attempt
        if (context.onRetry) {
          context.onRetry(attempt + 1, this.maxRetries, delay, error);
        }
        
        // Wait before retrying
        await this.sleep(delay);
        
        // Increase delay for next retry (exponential backoff)
        delay = Math.min(delay * this.backoffMultiplier, this.maxDelay);
        
        // Add jitter to prevent thundering herd
        delay += Math.random() * 1000;
      }
    }
    
    throw lastError;
  }
  
  /**
   * Check if error should trigger a retry
   */
  shouldRetry(error, attempt) {
    // Don't retry if max attempts reached
    if (attempt >= this.maxRetries) {
      return false;
    }
    
    // Retry on rate limit errors
    if (error.status === 429 || error.code === "rate_limited") {
      return true;
    }
    
    // Retry on retryable HTTP statuses
    if (error.status && this.retryableStatuses.includes(error.status)) {
      return true;
    }
    
    // Retry on network errors
    if (error.code === "ECONNRESET" || error.code === "ETIMEDOUT") {
      return true;
    }
    
    return false;
  }
  
  /**
   * Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Global rate limiters for different services
const notionRateLimiter = new RateLimiter({
  maxRequests: 3, // Notion: 3 requests per second
  timeWindow: 1000,
});

const openAIRateLimiter = new RateLimiter({
  maxRequests: 3, // Conservative: 3 requests per second
  timeWindow: 1000,
});

/**
 * Execute Notion API request with rate limiting and retries
 * @param {Function} fn - Async function that makes Notion API call
 * @param {object} options - Options for rate limiting and retries
 * @returns {Promise<any>}
 */
export async function executeNotionRequest(fn, options = {}) {
  const retryPolicy = new RetryPolicy({
    maxRetries: options.maxRetries || 3,
    initialDelay: options.initialDelay || 1000,
  });
  
  return await notionRateLimiter.execute(async () => {
    return await retryPolicy.execute(fn, {
      onRetry: (attempt, maxRetries, delay, error) => {
        if (options.onRetry) {
          options.onRetry(attempt, maxRetries, delay, error);
        } else {
          console.warn(
            `Notion API retry ${attempt}/${maxRetries} after ${Math.round(delay)}ms (${error.message})`
          );
        }
      },
    });
  });
}

/**
 * Execute OpenAI/AI API request with rate limiting and retries
 * @param {Function} fn - Async function that makes AI API call
 * @param {object} options - Options for rate limiting and retries
 * @returns {Promise<any>}
 */
export async function executeAIRequest(fn, options = {}) {
  const retryPolicy = new RetryPolicy({
    maxRetries: options.maxRetries || 2, // Fewer retries for AI (can be expensive)
    initialDelay: options.initialDelay || 2000,
    maxDelay: options.maxDelay || 60000, // AI can take longer
  });
  
  return await openAIRateLimiter.execute(async () => {
    return await retryPolicy.execute(fn, {
      onRetry: (attempt, maxRetries, delay, error) => {
        if (options.onRetry) {
          options.onRetry(attempt, maxRetries, delay, error);
        } else {
          console.warn(
            `AI API retry ${attempt}/${maxRetries} after ${Math.round(delay)}ms (${error.message})`
          );
        }
      },
    });
  });
}

/**
 * Batch API requests to respect rate limits
 * @param {Array<Function>} requests - Array of async functions
 * @param {object} options - Batching options
 * @returns {Promise<Array<any>>}
 */
export async function batchRequests(requests, options = {}) {
  const batchSize = options.batchSize || 3;
  const results = [];
  
  for (let i = 0; i < requests.length; i += batchSize) {
    const batch = requests.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(fn => fn().catch(err => ({ error: err })))
    );
    results.push(...batchResults);
    
    // Progress callback
    if (options.onProgress) {
      options.onProgress(Math.min(i + batchSize, requests.length), requests.length);
    }
  }
  
  return results;
}

/**
 * Create a rate-limited version of a function
 * @param {Function} fn - Function to rate limit
 * @param {object} options - Rate limiter options
 * @returns {Function} Rate-limited function
 */
export function rateLimit(fn, options = {}) {
  const limiter = new RateLimiter(options);
  
  return async function(...args) {
    return await limiter.execute(() => fn(...args));
  };
}

/**
 * Get rate limiter stats for monitoring
 */
export function getRateLimiterStats() {
  return {
    notion: {
      availableTokens: notionRateLimiter.tokens,
      maxTokens: notionRateLimiter.maxRequests,
      queueLength: notionRateLimiter.queue.length,
    },
    openai: {
      availableTokens: openAIRateLimiter.tokens,
      maxTokens: openAIRateLimiter.maxRequests,
      queueLength: openAIRateLimiter.queue.length,
    },
  };
}
