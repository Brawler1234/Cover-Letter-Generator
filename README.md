# Cover Letter Generator

A small web app that turns a job posting and your own background into a personalized, non-generic cover letter — then checks how well it lines up with the job posting's key terms.

## What it does

1. You paste the job posting, describe your background, explain what draws you to the role, and give a specific story or achievement.
2. Claude drafts a cover letter using only the details you provided — no invented achievements, no generic filler phrases like "results-driven" or "passionate about."
3. The letter appears in an editable box so you can tweak it by hand.
4. A built-in **keyword match** checker compares important terms from the job posting against your letter, showing which ones appear and which are missing — useful for gauging fit against the kind of automated scanners (ATS) many companies run cover letters through.

## Tech stack

- **Frontend:** Plain HTML, CSS, and JavaScript — no framework, no build step.
- **Backend:** Node.js with [Express](https://expressjs.com/), a tiny server whose only job is to keep the Claude API key private and forward requests to Claude.
- **AI:** [Claude](https://www.anthropic.com/claude) (`claude-sonnet-5`) via the official [`@anthropic-ai/sdk`](https://github.com/anthropics/anthropic-sdk-typescript).
- **Keyword matching:** Plain JavaScript, no external library — it extracts frequently repeated words from the job posting (filtering out common filler words) and checks each one against the generated letter.

## Running it locally

1. Clone this repo and install dependencies:
   ```
   npm install
   ```
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
