/**
 * API Error handling utilities
 * Provides generic error messages for production
 */

import { NextResponse } from 'next/server';

/**
 * Get appropriate error status code
 */
export function getErrorStatus(error: any): number {
  if (error?.response?.status) {
    return error.response.status;
  }
  if (error?.status) {
    return error.status;
  }
  return 500;
}

/**
 * Return generic error response (never leak server details)
 */
export function createGenericErrorResponse(
  error: any,
  status: number = 500,
  context?: string
) {
  // Log detailed error server-side (never exposed to client)
  console.error(`[API Error${context ? ` ${context}` : ''}] ${error?.message || 'Unknown error'}`, {
    status,
    stack: error?.stack,
    details: process.env.NODE_ENV === 'development' ? error : undefined,
  });
  
  // Return generic message to client
  const messages: Record<number, string> = {
    400: 'Invalid request',
    401: 'Authentication required',
    403: 'Access denied',
    404: 'Not found',
    429: 'Too many requests',
    500: 'Internal server error',
    502: 'Service unavailable',
    503: 'Service unavailable',
  };
  
  const message = messages[status] || 'An error occurred';
  
  return NextResponse.json(
    { error: message },
    { status }
  );
}

/**
 * Return validation error response
 */
export function createValidationErrorResponse(errors: string[]) {
  return NextResponse.json(
    {
      error: 'Invalid request',
      details:
        process.env.NODE_ENV === 'development'
          ? errors
          : undefined,
    },
    { status: 400 }
  );
}
