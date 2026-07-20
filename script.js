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
const resumeDropzoneBtn = document.getElementById('resume-dropzone');
const resumeInput = document.getElementById('resume-input');
const resumeFilenameEl = document.getElementById('resume-filename');
const resumeFilenameTextEl = document.getElementById('resume-filename-text');
const resumeRemoveBtn = document.getElementById('resume-remove');

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

// Pure base64 (no "data:application/pdf;base64," prefix) — that's the shape
// the Claude API's document content block expects. null when no resume is
// attached.
let resumeBase64 = null;
let resumeName = null;

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

function clearResume() {
  resumeBase64 = null;
  resumeName = null;
  resumeInput.value = '';
  resumeFilenameEl.hidden = true;
  resumeFilenameTextEl.textContent = '';
  resumeDropzoneBtn.hidden = false;
}

// FileReader gives back a data URL like "data:application/pdf;base64,XXXX" —
// the API wants just the base64 part after the comma.
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

resumeDropzoneBtn.addEventListener('click', () => resumeInput.click());

resumeInput.addEventListener('change', async () => {
  const file = resumeInput.files[0];
  if (!file) return;

  if (file.type !== 'application/pdf') {
    setStatus('Please upload a PDF file.', true);
    resumeInput.value = '';
    return;
  }

  if (file.size > MAX_RESUME_BYTES) {
    setStatus('Resume file is too large — please upload a PDF under 5MB.', true);
    resumeInput.value = '';
    return;
  }

  try {
    resumeBase64 = await readFileAsBase64(file);
    resumeName = file.name;
    resumeFilenameTextEl.textContent = file.name;
    resumeFilenameEl.hidden = false;
    resumeDropzoneBtn.hidden = true;
    setStatus('');
  } catch (err) {
    setStatus('Could not read that file. Please try again.', true);
    clearResume();
  }
});

resumeRemoveBtn.addEventListener('click', clearResume);

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const jobPosting = document.getElementById('job-posting').value.trim();
  const background = document.getElementById('background').value.trim();
  const motivation = document.getElementById('motivation').value.trim();
  const story = document.getElementById('story').value.trim();
  const avoid = document.getElementById('avoid').value.trim();

  if (!background && !resumeBase64) {
    setStatus('Please type your background or upload a resume.', true);
    return;
  }

  submitBtn.disabled = true;
  resultSection.hidden = true;
  keywordSection.hidden = true;
  setStatus('Generating your cover letter...');

  try {
    const response = await fetch('/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobPosting,
        background,
        motivation,
        story,
        avoid,
        resumeFile: resumeBase64 ? { data: resumeBase64, filename: resumeName } : null,
      }),
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
