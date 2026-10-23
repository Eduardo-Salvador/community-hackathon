export class ToolError extends Error {
  constructor(
    public code:
      | 'UF_REQUIRED'
      | 'LOGIN_REQUIRED'
      | 'NOT_FOUND'
      | 'NOT_IMPLEMENTED'
      | 'BROWSER_UNAVAILABLE'
      | 'EXTRACTION_FAILED',
    message: string,
  ) {
    super(message);
  }
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
