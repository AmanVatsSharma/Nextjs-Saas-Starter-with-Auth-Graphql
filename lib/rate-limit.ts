import { LRUCache } from 'lru-cache';

export interface RateLimitOptions {
  interval: number; // Time window in milliseconds
  uniqueTokenPerInterval: number; // Max unique tokens (IPs) to track
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;   
  reset: number;
} 

export default function rateLimit(options: RateLimitOptions) {
  const tokenCache = new LRUCache({
    max: options.uniqueTokenPerInterval || 500,
    ttl: options.interval || 60000,
  });
 
  return {
    check: async (limit: number, token: string): Promise<RateLimitResult> => {
      const tokenCount = (tokenCache.get(token) as number[]) || [0];
      const currentTime = Date.now();
      const windowStart = currentTime - options.interval;

      // Remove old timestamps  
      const validRequests = tokenCount.filter(time => time > windowStart); 
      
      if (validRequests.length >= limit) { 
        const oldestRequest = Math.min(...validRequests);
        const resetTime = oldestRequest + options.interval;
        
        throw new Error(`Rate limit exceeded. Try again in ${Math.ceil((resetTime - currentTime) / 1000)} seconds`);
      }

      // Add current request
      validRequests.push(currentTime);
      tokenCache.set(token, validRequests);

      return {
        success: true,
        limit,
        remaining: limit - validRequests.length,
        reset: Math.ceil((windowStart + options.interval) / 1000),
      };
    },
  };
}