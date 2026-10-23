export type AdapterErrorCode =
  | 'NOT_CONFIGURED'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'HTTP_ERROR'
  | 'INVALID_RESPONSE'
  | 'PROVIDER_ERROR';

export class AdapterError extends Error {
  constructor(
    public provider: string,
    public code: AdapterErrorCode,
    message: string,
    public options: { status?: number; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}
