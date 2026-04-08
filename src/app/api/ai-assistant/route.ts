import { isValidCloudSession } from '@/lib/auth-server';
import { checkRateLimit, RATE_LIMIT_CONFIG } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    // Convert Request to NextRequest for rate limiting check
    const request = req instanceof NextRequest ? req : new NextRequest(req);

    // Rate limiting check - AI assistant is expensive
    const rateLimit = checkRateLimit(request, RATE_LIMIT_CONFIG.aiAssistant);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfter || 60),
          },
        }
      );
    }

    const { mood, type, selectedGenres, era, groqApiKey: userApiKey } = await req.json();

    // If user provided their own key, we don't strictly need a Cloud account
    if (!userApiKey || userApiKey === '__PUBLIC_GROQ_KEY__') {
      const isAuthorized = await isValidCloudSession(req);
      if (!isAuthorized) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }
    }

    const apiKey = (!userApiKey || userApiKey === '__PUBLIC_GROQ_KEY__') ? process.env.GROQ_API_KEY : userApiKey;

    if (!apiKey) {
      console.error('[AI] Missing GROQ_API_KEY in Pages Environment Variables');
      return NextResponse.json(
        { error: 'Service temporarily unavailable' },
        { status: 503 }
      );
    }

    const systemPrompt = `You are a movie expert. Your goal is to find 10 movies or TV shows based on the user's specific genre, vibe, and era preferences.

Selected Genres: ${selectedGenres?.join(', ') || 'Any'}
Preferred Era: ${era || 'Any'}
Additional Description: ${mood || 'None'}

Return ONLY raw JSON in the following format (10 recommendations):
{
  "recommendations": [
    {
      "title": "Exact English or Original Title",
      "year": 2024,
      "genres": ["Genre1", "Genre2"],
      "reason": "Short, one-sentence reason why this fits (in English).",
      "match_score": 95
    }
  ]
}

IMPORTANT:
1. Provide exactly 10 recommendations.
2. The 'title' MUST be the official English title or the Original title as listed on TMDB.
3. 'genres' should be an array of 2-3 main genres.
4. 'match_score' is a number between 1 and 100.
5. 'reason' must be in English.
6. Strictly respect the 'Era' filter if provided (e.g., if '90s', only recommend titles from 1990-1999).`;

    const userPrompt = `I am looking for a: ${type === 'show' ? 'TV Show' : 'Movie'}.
Focus on these Genres: ${selectedGenres?.join(', ') || 'Any'}.
Era: ${era || 'Any'}.
${mood ? `Extra details: ${mood}` : ''}

Task: Recommend 10 titles that perfectly match these criteria.`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.6,
        max_tokens: 2048,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq API Error:', errorText);
      return NextResponse.json(
        { error: 'Service error' },
        { status: response.status >= 500 ? 502 : response.status }
      );
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      console.error('[AI] Empty response from Groq API');
      return NextResponse.json(
        { error: 'Service error' },
        { status: 502 }
      );
    }

    try {
      const jsonResponse = JSON.parse(content);
      return NextResponse.json(jsonResponse);
    } catch (e) {
      console.error('JSON Parse Error:', content, e);
      return NextResponse.json(
        { error: 'Service error' },
        { status: 502 }
      );
    }

  } catch (error) {
    console.error('[AI] Unhandled error:', error);
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    );
  }
}
