# Cover Letter Generator

**Live demo:** https://cover-letter-generator-qyob.onrender.com

A small web app that turns a job posting and your own background into a personalized, non-generic cover letter and resume — checks the letter against the job posting's key terms, and lets you export the resume as a real PDF.

## What it does

1. You paste the job posting, describe your background (or upload your resume as a PDF instead of typing it), explain what draws you to the role, and give a specific story or achievement.
2. Generate a **cover letter** — Claude drafts it using only the details you provided, no invented achievements, no generic filler phrases like "results-driven" or "passionate about." A built-in **keyword match** checker then compares important terms from the job posting against your letter, showing which ones appear and which are missing — useful for gauging fit against the kind of automated scanners (ATS) many companies run cover letters through.
3. Generate a matching **resume** from the same details, following the same fixed section structure every time (Summary, Skills, Projects, Certifications, Experience, Education) — a section only appears if your actual background supports it, nothing is invented to fill a gap.
4. Both outputs land in an editable box so you can tweak them by hand — the resume also gets a live formatted preview next to it as you edit.
5. **Export the resume as a PDF** — built with jsPDF entirely in the browser, so it's genuine selectable, searchable text, not a screenshot or image, with proper margins, section headers, and page breaks.

## Tech stack

- **Frontend:** Plain HTML, CSS, and JavaScript — no framework, no build step.
- **Backend:** Node.js with [Express](https://expressjs.com/), a tiny server whose only job is to keep the Claude API key private and forward requests to Claude.
- **AI:** [Claude](https://www.anthropic.com/claude) (`claude-sonnet-5`) via the official [`@anthropic-ai/sdk`](https://github.com/anthropics/anthropic-sdk-typescript).
- **Keyword matching:** Plain JavaScript, no external library — it extracts frequently repeated words from the job posting (filtering out common filler words) and checks each one against the generated letter.
- **PDF export:** [jsPDF](https://github.com/parallax/jsPDF), loaded from a small vendored copy (`vendor/jspdf.umd.min.js`) rather than a CDN, so resume downloads don't depend on a third party being up. Runs entirely client-side — no server involvement, no added API cost.

## Running it locally

1. Clone this repo and install dependencies:
   ```
   npm install
   ```
   (jsPDF doesn't need a separate install step — it's a small file already checked into the repo at `vendor/jspdf.umd.min.js` and served as a static file, not an npm package.)
2. Get an API key from [console.anthropic.com](https://console.anthropic.com) — note this is separate from a Claude.ai subscription; it's its own account with its own pay-as-you-go billing.
3. Copy `.env.example` to `.env` and paste your key in:
   ```
   ANTHROPIC_API_KEY=your-key-here
   ```
4. Start the server:
   ```
   node server.js
   ```
5. Open `http://localhost:3000` in your browser.

Your API key stays in `.env` the whole time — it's excluded from git via `.gitignore` and never sent to the browser.

## Why I built this

I wanted to learn to build with AI hands-on, and I was frustrated with generic cover letters — this project let me work on both at the same time.

## What I learned

This was my first time connecting a frontend to a backend to a third-party API. Along the way I learned:

- How to keep credentials secure — the API key lives only in a `.env` file on my machine, is excluded from git, and is never sent to the browser.
- How to design a prompt that avoids generic AI-sounding output, by requiring the model to use only specific details I provide instead of falling back on filler phrases.
- How to generate real, selectable documents entirely in the browser — building the resume's PDF export with jsPDF meant handling text layout, wrapping, and pagination by hand, and understanding the real difference between actual PDF text and a screenshot dressed up as one.
- How to handle binary file uploads end-to-end — reading an uploaded PDF resume in the browser, sending it to the backend, and passing it straight to Claude as a document instead of trying to extract the text myself.
- How to think in a design system instead of styling each feature from scratch — reusing the same spacing scale, colors, and component patterns (cards, badges, animations) as the app grew from one feature to several.
