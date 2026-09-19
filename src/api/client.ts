import crypto from 'node:crypto';
import { BASE_URL } from './endpoints.js';
import {
  AuthenticationError,
  RateLimitError,
  NetworkError,
  ConversationNotFoundError,
} from './types.js';
import { logger } from '../utils/logger.js';
import { getRandomUserAgent, DEFAULT_USER_AGENT } from '../utils/user-agent.js';
import { withRetry, type RetryOptions } from '../utils/retry.js';
import type { TimeoutConfig } from './types.js';

export interface ClientOptions {
  verbose?: boolean;
  timeout?: TimeoutConfig;
  rotateUserAgent?: boolean;
  cookies?: string;
}

export class ChatGPTClient {
  private accessToken: string | undefined;
  private cookies: string | undefined;
  private verbose: boolean;
  private deviceId: string;
  private timeoutConfig: TimeoutConfig;
  private rotateUserAgent: boolean;
  private userAgent: string;

  constructor(accessToken: string | undefined, options: ClientOptions = {}) {
    this.accessToken = accessToken;
    this.cookies = options.cookies;
    this.verbose = options.verbose ?? false;
    this.deviceId = crypto.randomUUID();
    this.timeoutConfig = options.timeout ?? { api: 30000, download: 120000 };
    this.rotateUserAgent = options.rotateUserAgent ?? false;
    this.userAgent = DEFAULT_USER_AGENT;
  }

  private getUserAgent(): string {
    if (this.rotateUserAgent) {
      return getRandomUserAgent();
    }
    return this.userAgent;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': this.getUserAgent(),
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://chatgpt.com/',
      'Origin': 'https://chatgpt.com',
      'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"macOS"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'Oai-Device-Id': this.deviceId,
      'Oai-Language': 'en-US',
    };
    if (this.cookies) {
      headers['Cookie'] = this.cookies;
    } else if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    return headers;
  }

  async initialize(): Promise<void> {
    // fetchRaw throws AuthenticationError on 401/403, so reaching here = success
    await this.fetchRaw(`${BASE_URL}/backend-api/conversations?offset=0&limit=1`);
    logger.info('Successfully authenticated');
  }

  async fetch<T>(
    endpoint: string,
    options: {
      method?: string;
      body?: unknown;
      parseResponse?: (data: unknown) => T;
      retryOptions?: Partial<RetryOptions>;
    } = {}
  ): Promise<T> {
    const { method = 'GET', body, parseResponse, retryOptions } = options;

    return withRetry(
      async () => {
        const buffer = await this.fetchRaw(
          `${BASE_URL}${endpoint}`,
          { method, body, timeout: this.timeoutConfig.api }
        );
        const text = new TextDecoder().decode(buffer);
        const data = JSON.parse(text);
        return parseResponse ? parseResponse(data) : (data as T);
      },
      {
        ...retryOptions,
        onRetry: (error, attempt, delay) => {
          logger.info(`Retry ${attempt}: ${error.message} (waiting ${Math.round(delay / 1000)}s)`);
        },
      }
    );
  }

  async fetchRaw(
    url: string,
    options: {
      method?: string;
      body?: unknown;
      timeout?: number;
      retryOptions?: Partial<RetryOptions>;
    } = {}
  ): Promise<ArrayBuffer> {
    const { method = 'GET', body, timeout = this.timeoutConfig.download, retryOptions } = options;
    const isAbsolute = url.startsWith('http://') || url.startsWith('https://');
    const isSameOrigin = !isAbsolute || url.startsWith(BASE_URL);
    const headers = isSameOrigin ? this.getHeaders() : {};

    const fetchOnce = async (): Promise<ArrayBuffer> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        if (!response.ok) {
          if (isSameOrigin && (response.status === 401 || response.status === 403)) {
            throw new AuthenticationError('Access token expired or invalid.');
          }
          if (isSameOrigin && response.status === 404) {
            throw new ConversationNotFoundError('Conversation not found');
          }
          if (response.status === 429) {
            const retryAfter = response.headers.get('retry-after');
            throw new RateLimitError(
              'Rate limited by API',
              retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined
            );
          }
          throw new NetworkError(
            `Request failed: ${response.status} ${response.statusText}`,
            response.status
          );
        }

        return await response.arrayBuffer();
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new NetworkError(`Request timed out after ${timeout}ms`, 408);
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    };

    if (retryOptions) {
      return withRetry(fetchOnce, {
        ...retryOptions,
        onRetry: (error, attempt, delay) => {
          logger.info(`Retry ${attempt}: ${error.message} (waiting ${Math.round(delay / 1000)}s)`);
        },
      });
    }
    return fetchOnce();
  }
}
