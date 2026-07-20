require('dotenv').config();

const express = require('express');
const rateLimit = require('express-rate-limit');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// Render (and most hosting platforms) sit in front of the app as a reverse
// proxy. Without this, every visitor would appear to share Render's proxy
// IP, and the rate limiter below would treat all visitors as one — this
// tells Express to trust the first proxy hop and read the real visitor IP
// from the X-Forwarded-For header instead.
app.set('trust proxy', 1);

// Each visitor (identified by IP) gets this many /generate calls per window
// before being blocked — protects against runaway API costs.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_REQUESTS = 5;

// Matches the frontend's own limit — a 5MB PDF becomes ~6.7MB once
// base64-encoded, so the default 100kb JSON body limit has to grow to fit it.
const MAX_RESUME_BYTES = 5 * 1024 * 1024;

// Reads ANTHROPIC_API_KEY from the environment automatically — the key
// never touches the frontend code.
const client = new Anthropic();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// Blocks a request BEFORE it reaches the route below once a visitor hits
// the limit — so over-limit requests never call (and never cost) Claude.
const generateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  // Shaped as { error: "..." } so the existing frontend error handling in
  // script.js (which reads data.error) displays this with no changes needed.
  message: {
    error: `You've reached the limit of ${RATE_LIMIT_MAX_REQUESTS} cover letters per hour. Please try again later.`,
  },
});

// Shared by /generate and /generate-resume — both accept the same optional
// PDF resume upload and need the same size check and document-block wrapping.
function isResumeFileTooLarge(resumeFile) {
  const approxBytes = resumeFile.data.length * 0.75; // base64 -> ~raw bytes
  return approxBytes > MAX_RESUME_BYTES;
}

function buildMessageContent(prompt, resumeFile) {
  if (!resumeFile || !resumeFile.data) return prompt;

  // Claude reads PDFs natively as a document content block — no
  // text-extraction library needed on our end. The document goes before
  // the instructions, same convention the Claude API docs use.
  return [
    {
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: resumeFile.data,
      },
    },
    { type: 'text', text: prompt },
  ];
}

function buildPrompt({ jobPosting, background, motivation, story, avoid, hasResume }) {
  return `You are helping draft a personalized, specific cover letter. Avoid generic AI-sounding language entirely — no phrases like "results-driven," "passionate about," "proven track record," "dynamic team player," or opening with "I am excited to apply for."

Use ONLY the specific details provided below${hasResume ? ', including the attached resume,' : ''}. Do not invent achievements, numbers, or experiences not mentioned. If the provided details are thin in a section, keep that part brief and honest rather than padding it with generic claims.

Mirror 2-3 key phrases or priorities from the job posting naturally, without sounding like keyword-stuffing.

Job posting:
${jobPosting}

Candidate background:
${background || (hasResume ? '(see attached resume)' : '')}

Why this role/company interests them:
${motivation}

A real story or achievement to draw from:
${story}

Avoid mentioning:
${avoid || '(nothing specified)'}

Write a cover letter, 250-350 words, in a natural, confident, first-person voice. It should sound like a specific real person wrote it, not like a template.`;
}

// Fixed section structure so every generated resume is laid out the same
// way — only the content varies, and a section is included only when the
// candidate's actual details support it (nothing is invented to fill a gap).
function buildResumePrompt({ jobPosting, background, motivation, story, avoid, hasResume }) {
  return `You are helping build a tailored, honest resume for a specific job application. Use ONLY the specific details provided below${hasResume ? ', including the attached resume,' : ''}. Do not invent job titles, companies, dates, numbers, skills, or achievements not mentioned in the provided details.

Follow this exact section order. Only include a section if the candidate's provided details actually contain that kind of content for it — never invent content to fill a section, and never add sections outside this structure:

[Full Name]
[Phone] | [Email] | [Location] | [LinkedIn/portfolio, if provided]

SUMMARY
2-3 sentences, tailored to the job posting below, based only on the candidate's actual background.

SKILLS
Category label: skill, skill, skill (group related skills under short category labels)

PROJECTS
(Only include this section if the candidate's background mentions a specific project.)
Project Name
- bullet
- bullet

CERTIFICATIONS
(Only include this section if the candidate's background mentions certifications or completed coursework/certificates.)
- Certification name — Issuer (year)

EXPERIENCE
Job Title | Company | Dates
- bullet describing a responsibility or result
- bullet

EDUCATION
Degree/Program — School (Dates)

Job posting:
${jobPosting}

Candidate background:
${background || (hasResume ? '(see attached resume)' : '')}

Why this role/company interests them:
${motivation}

A real story or achievement, useful for tone or as a bullet if it fits naturally:
${story}

Avoid mentioning:
${avoid || '(nothing specified)'}

Write the resume in plain text using the section headers exactly as shown (SUMMARY, SKILLS, PROJECTS, CERTIFICATIONS, EXPERIENCE, EDUCATION), omitting any section the candidate's details don't support. Mirror 2-3 priorities from the job posting naturally where the candidate's real background actually supports it — do not stretch unrelated experience to fit.`;
}

app.post('/generate', generateLimiter, async (req, res) => {
  const { jobPosting, background, motivation, story, avoid, resumeFile } = req.body || {};

  const hasBackground = !!(background && background.trim());
  const hasResume = !!(resumeFile && resumeFile.data);

  if (!jobPosting || !motivation || !story || (!hasBackground && !hasResume)) {
    return res.status(400).json({
      error: 'Please fill in the job posting, motivation, and story fields, and provide your background as text or a resume upload.',
    });
  }

  // Defense in depth — the frontend already checks the raw file size before
  // encoding, but that check lives in JavaScript a visitor could bypass.
  if (hasResume && isResumeFileTooLarge(resumeFile)) {
    return res.status(400).json({ error: 'Resume file is too large. Please upload a PDF under 5MB.' });
  }

  try {
    const prompt = buildPrompt({ jobPosting, background, motivation, story, avoid, hasResume });
    const messageContent = buildMessageContent(prompt, resumeFile);

    const response = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2000,
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: messageContent }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    const letter = textBlock ? textBlock.text : '';

    res.json({ letter });
  } catch (err) {
    console.error('Claude API error:', err);
    res.status(500).json({ error: 'Something went wrong generating the cover letter. Please try again.' });
  }
});

// Reuses generateLimiter (not a separate limiter instance) so cover letter
// and resume generation share one 5-per-hour-per-IP budget, not 5 each.
app.post('/generate-resume', generateLimiter, async (req, res) => {
  const { jobPosting, background, motivation, story, avoid, resumeFile } = req.body || {};

  const hasBackground = !!(background && background.trim());
  const hasResume = !!(resumeFile && resumeFile.data);

  if (!jobPosting || !motivation || !story || (!hasBackground && !hasResume)) {
    return res.status(400).json({
      error: 'Please fill in the job posting, motivation, and story fields, and provide your background as text or a resume upload.',
    });
  }

  if (hasResume && isResumeFileTooLarge(resumeFile)) {
    return res.status(400).json({ error: 'Resume file is too large. Please upload a PDF under 5MB.' });
  }

  try {
    const prompt = buildResumePrompt({ jobPosting, background, motivation, story, avoid, hasResume });
    const messageContent = buildMessageContent(prompt, resumeFile);

    const response = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2000,
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: messageContent }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    const resume = textBlock ? textBlock.text : '';

    res.json({ resume });
  } catch (err) {
    console.error('Claude API error:', err);
    res.status(500).json({ error: 'Something went wrong generating the resume. Please try again.' });
  }
});

app.listen(PORT, () => {
  console.log(`Cover letter generator running at http://localhost:${PORT}`);
});
