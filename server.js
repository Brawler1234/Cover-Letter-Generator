require('dotenv').config();

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// Reads ANTHROPIC_API_KEY from the environment automatically — the key
// never touches the frontend code.
const client = new Anthropic();

app.use(express.json());
app.use(express.static(__dirname));

function buildPrompt({ jobPosting, background, motivation, story, avoid }) {
  return `You are helping draft a personalized, specific cover letter. Avoid generic AI-sounding language entirely — no phrases like "results-driven," "passionate about," "proven track record," "dynamic team player," or opening with "I am excited to apply for."

Use ONLY the specific details provided below. Do not invent achievements, numbers, or experiences not mentioned. If the provided details are thin in a section, keep that part brief and honest rather than padding it with generic claims.

Mirror 2-3 key phrases or priorities from the job posting naturally, without sounding like keyword-stuffing.

Job posting:
${jobPosting}

Candidate background:
${background}

Why this role/company interests them:
${motivation}

A real story or achievement to draw from:
${story}

Avoid mentioning:
${avoid || '(nothing specified)'}

Write a cover letter, 250-350 words, in a natural, confident, first-person voice. It should sound like a specific real person wrote it, not like a template.`;
}

app.post('/generate', async (req, res) => {
  const { jobPosting, background, motivation, story, avoid } = req.body || {};

  if (!jobPosting || !background || !motivation || !story) {
    return res.status(400).json({
      error: 'Please fill in the job posting, background, motivation, and story fields.',
    });
  }

  try {
    const prompt = buildPrompt({ jobPosting, background, motivation, story, avoid });

    const response = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2000,
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    const letter = textBlock ? textBlock.text : '';

    res.json({ letter });
  } catch (err) {
    console.error('Claude API error:', err);
    res.status(500).json({ error: 'Something went wrong generating the cover letter. Please try again.' });
  }
});

app.listen(PORT, () => {
  console.log(`Cover letter generator running at http://localhost:${PORT}`);
});
