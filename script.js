const form = document.getElementById('letter-form');
const submitBtn = document.getElementById('submit-btn');
const statusEl = document.getElementById('status');
const resultSection = document.getElementById('result-section');
const resultEl = document.getElementById('result');
const keywordSection = document.getElementById('keyword-section');
const keywordSummaryEl = document.getElementById('keyword-summary');
const keywordsFoundEl = document.getElementById('keywords-found');
const keywordsMissingEl = document.getElementById('keywords-missing');
const recheckBtn = document.getElementById('recheck-btn');

// Common English filler words we don't want treated as "keywords" from the
// job posting — this is what keeps things like "the" and "with" out of the
// match list.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'you', 'your', 'with', 'this', 'that', 'from',
  'will', 'have', 'has', 'our', 'about', 'their', 'they', 'them', 'who',
  'what', 'when', 'where', 'how', 'all', 'any', 'can', 'able', 'also',
  'into', 'more', 'most', 'other', 'some', 'such', 'than', 'then', 'these',
  'those', 'were', 'was', 'been', 'being', 'each', 'both', 'own', 'same',
  'not', 'very', 'over', 'under', 'while', 'during', 'across', 'per',
  'must', 'should', 'would', 'could', 'may', 'might', 'shall', 'here',
  'there', 'within', 'including', 'looking', 'like', 'well', 'work',
  'working', 'role', 'position', 'job', 'company', 'team', 'apply',
]);

// Pull out the words that show up most often in the job posting (after
// removing filler words) — these stand in for the "important keywords" an
// ATS-style scan would look for.
function extractKeywords(text, maxKeywords = 15) {
  const counts = new Map();
  const words = text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) || [];

  for (const raw of words) {
    const word = raw.replace(/^[-']+|[-']+$/g, '');
    if (word.length < 4 || STOPWORDS.has(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

// Check which of those keywords actually show up in the generated letter.
function matchKeywords(keywords, letterText) {
  const letterLower = letterText.toLowerCase();
  return keywords.map((word) => ({
    word,
    found: letterLower.includes(word),
  }));
}

function renderKeywordMatch(jobPostingText, letterText) {
  const keywords = extractKeywords(jobPostingText);

  if (keywords.length === 0) {
    keywordSection.hidden = true;
    return;
  }

  const results = matchKeywords(keywords, letterText);
  const foundCount = results.filter((r) => r.found).length;

  keywordSummaryEl.textContent = `${foundCount} of ${results.length} keywords from the job posting appear in your letter.`;

  keywordsFoundEl.innerHTML = '';
  keywordsMissingEl.innerHTML = '';

  for (const { word, found } of results) {
    const li = document.createElement('li');
    li.textContent = word;
    (found ? keywordsFoundEl : keywordsMissingEl).appendChild(li);
  }

  keywordSection.hidden = false;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.hidden = !message;
  statusEl.classList.toggle('error', isError);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const jobPosting = document.getElementById('job-posting').value.trim();
  const background = document.getElementById('background').value.trim();
  const motivation = document.getElementById('motivation').value.trim();
  const story = document.getElementById('story').value.trim();
  const avoid = document.getElementById('avoid').value.trim();

  submitBtn.disabled = true;
  resultSection.hidden = true;
  keywordSection.hidden = true;
  setStatus('Generating your cover letter...');

  try {
    const response = await fetch('/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobPosting, background, motivation, story, avoid }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Something went wrong.');
    }

    resultEl.value = data.letter;
    resultSection.hidden = false;
    renderKeywordMatch(jobPosting, data.letter);
    setStatus('');
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    submitBtn.disabled = false;
  }
});

// Lets you re-run the keyword check after hand-editing the letter, without
// generating a whole new one.
recheckBtn.addEventListener('click', () => {
  const jobPosting = document.getElementById('job-posting').value.trim();
  renderKeywordMatch(jobPosting, resultEl.value);
});
