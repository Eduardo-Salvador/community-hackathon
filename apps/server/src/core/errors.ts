export class ToolError extends Error {
  constructor(
    public code:
      | 'UF_REQUIRED'
      | 'LOGIN_REQUIRED'
      | 'NOT_FOUND'
      | 'IDENTIFIERS_REQUIRED'
      | 'NOT_IMPLEMENTED',
    message: string,
  ) {
    super(message);
  }
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
