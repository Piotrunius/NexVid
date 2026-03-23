import { NextResponse } from 'next/server';

export const runtime = 'edge';

const WORKER_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized - Please log in' }, { status: 401 });
    }

    // 1. Check & Increment Limit in Worker
    const limitRes = await fetch(`${WORKER_URL}/user/ai-limits`, {
      method: 'POST',
      headers: { 'Authorization': authHeader }
    });

    if (!limitRes.ok) {
      if (limitRes.status === 429) {
        return NextResponse.json({ error: 'Daily limit reached (5/5). Come back tomorrow!' }, { status: 429 });
      }
      return NextResponse.json({ error: 'Failed to verify usage limit' }, { status: 500 });
    }

    const { mood, type, selectedGenres, selectedMoods, era } = await req.json();
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing Groq API Key' }, { status: 500 });
    }

    const systemPrompt = `You are a movie expert. Your goal is to find 10 movies or TV shows based on the user's specific genre, vibe, and era preferences.

Selected Genres: ${selectedGenres?.join(', ') || 'Any'}
Selected Moods/Vibes: ${selectedMoods?.join(', ') || 'Any'}
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
Vibe: ${selectedMoods?.join(', ') || 'Any'}.
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
      return NextResponse.json({ error: 'AI Connection Error' }, { status: response.status });
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json({ error: 'Empty response from AI' }, { status: 500 });
    }

    try {
      const jsonResponse = JSON.parse(content);
      return NextResponse.json(jsonResponse);
    } catch {
      console.error('JSON Parse Error:', content);
      return NextResponse.json({ error: 'AI Data Formatting Error' }, { status: 500 });
    }

  } catch (error) {
    console.error('Server Error:', error);
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
