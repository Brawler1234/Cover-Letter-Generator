const form = document.getElementById('letter-form');
const submitBtn = document.getElementById('submit-btn');
const resumeBtn = document.getElementById('generate-resume-btn');
const statusEl = document.getElementById('status');
const resultSection = document.getElementById('result-section');
const resultEl = document.getElementById('result');
const resumeSection = document.getElementById('resume-section');
const resumeResultEl = document.getElementById('resume-result');
const resumePreviewEl = document.getElementById('resume-preview');
const downloadResumeBtn = document.getElementById('download-resume-btn');
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

// The fixed section headings the resume prompt is instructed to use — see
// buildResumePrompt in server.js. Shared by the preview renderer and the
// PDF generator below, so both read the resume the same way.
const RESUME_HEADINGS = ['SUMMARY', 'SKILLS', 'PROJECTS', 'CERTIFICATIONS', 'EXPERIENCE', 'EDUCATION'];

// Turns the resume textarea's plain text into { name, contactLine, sections }.
// Content appearing before the first recognized heading (e.g. if a heading
// got edited away) is captured under heading: '' so it still renders as
// plain paragraphs instead of being silently dropped.
function parseResumeText(text) {
  const lines = text.split('\n');
  let i = 0;
  const skipBlank = () => {
    while (i < lines.length && lines[i].trim() === '') i++;
  };

  skipBlank();
  const name = (lines[i] || '').trim();
  if (name) i++;
  skipBlank();
  const contactLine = (lines[i] || '').trim();
  if (contactLine) i++;

  const sections = [];
  let current = null;
  for (; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (RESUME_HEADINGS.includes(trimmed)) {
      current = { heading: trimmed, body: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      if (!trimmed) continue;
      current = { heading: '', body: [] };
      sections.push(current);
    }
    current.body.push(lines[i]);
  }

  return {
    name,
    contactLine,
    sections: sections
      .map((s) => ({ heading: s.heading, body: s.body.join('\n').trim() }))
      .filter((s) => s.body),
  };
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// SUMMARY renders as a plain paragraph; SKILLS bolds the "Category:" label
// on each line; every other section (PROJECTS, CERTIFICATIONS, EXPERIENCE,
// EDUCATION) treats "- " lines as bullets and any other line as a bold
// entry title (job title, project name, degree line, etc).
function renderResumeSectionBody(heading, body) {
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);

  if (heading === 'SUMMARY' || !heading) {
    return `<p class="resume-body-text">${escapeHtml(lines.join(' '))}</p>`;
  }

  if (heading === 'SKILLS') {
    return lines
      .map((line) => {
        const idx = line.indexOf(':');
        if (idx === -1) return `<p class="resume-skill-line">${escapeHtml(line)}</p>`;
        const label = line.slice(0, idx + 1);
        const rest = line.slice(idx + 1);
        return `<p class="resume-skill-line"><strong>${escapeHtml(label)}</strong>${escapeHtml(rest)}</p>`;
      })
      .join('');
  }

  let html = '';
  let bullets = [];
  const flushBullets = () => {
    if (bullets.length) {
      html += `<ul class="resume-bullets">${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`;
      bullets = [];
    }
  };
  for (const line of lines) {
    if (line.startsWith('- ') || line.startsWith('• ')) {
      bullets.push(line.replace(/^[-•]\s*/, ''));
    } else {
      flushBullets();
      html += `<p class="resume-entry-title">${escapeHtml(line)}</p>`;
    }
  }
  flushBullets();
  return html;
}

function renderResumePreview() {
  const parsed = parseResumeText(resumeResultEl.value);
  const hasContent = Boolean(parsed.name || parsed.sections.length);

  downloadResumeBtn.disabled = !hasContent;

  if (!hasContent) {
    resumePreviewEl.innerHTML = '<p class="resume-preview-empty">Generate or write a resume above to see a formatted preview here.</p>';
    return;
  }

  let html = '';
  if (parsed.name) html += `<p class="resume-preview-name">${escapeHtml(parsed.name)}</p>`;
  if (parsed.contactLine) html += `<p class="resume-preview-contact">${escapeHtml(parsed.contactLine)}</p>`;
  for (const section of parsed.sections) {
    if (section.heading) html += `<h3 class="resume-preview-heading">${escapeHtml(section.heading)}</h3>`;
    html += renderResumeSectionBody(section.heading, section.body);
  }
  resumePreviewEl.innerHTML = html;
}

resumeResultEl.addEventListener('input', renderResumePreview);

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

// Shared by both submit buttons — same form fields feed either endpoint,
// only the target endpoint and what happens with the response differ.
async function runGeneration({ endpoint, loadingMessage, onSuccess }) {
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
  resumeBtn.disabled = true;
  setStatus(loadingMessage);

  try {
    const response = await fetch(endpoint, {
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

    onSuccess(data, jobPosting);
    setStatus('');
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    submitBtn.disabled = false;
    resumeBtn.disabled = false;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();

  // Both buttons are type="submit" on the same form, so native `required`
  // field validation runs for either one — event.submitter tells us which
  // was actually clicked.
  if (event.submitter && event.submitter.id === 'generate-resume-btn') {
    resumeSection.hidden = true;
    runGeneration({
      endpoint: '/generate-resume',
      loadingMessage: 'Generating your resume...',
      onSuccess: (data) => {
        resumeResultEl.value = data.resume;
        resumeSection.hidden = false;
        renderResumePreview();
      },
    });
  } else {
    resultSection.hidden = true;
    keywordSection.hidden = true;
    runGeneration({
      endpoint: '/generate',
      loadingMessage: 'Generating your cover letter...',
      onSuccess: (data, jobPosting) => {
        resultEl.value = data.letter;
        resultSection.hidden = false;
        renderKeywordMatch(jobPosting, data.letter);
      },
    });
  }
});

// Lets you re-run the keyword check after hand-editing the letter, without
// generating a whole new one.
recheckBtn.addEventListener('click', () => {
  const jobPosting = document.getElementById('job-posting').value.trim();
  renderKeywordMatch(jobPosting, resultEl.value);
});

function slugifyResumeFilename(name) {
  const slug = (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'resume'}-resume.pdf`;
}

// Builds the downloadable PDF straight from the same parsed structure the
// preview uses, so what you see in the preview is what you get in the file.
// A4, ~19mm margins, Helvetica (jsPDF's built-in font — see the plan notes
// on why we're not embedding Inter). Pagination is manual: jsPDF doesn't
// paginate text on its own, so we track the vertical cursor and break the
// page before content would overflow, reserving enough room before each
// section heading that it never lands alone at the bottom of a page.
function generateResumePdf() {
  const parsed = parseResumeText(resumeResultEl.value);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 19;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  function ensureSpace(neededHeight) {
    if (y + neededHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  }

  // Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(17, 17, 17);
  ensureSpace(8);
  doc.text(parsed.name || 'Resume', margin, y);
  y += 8;

  // Contact line
  if (parsed.contactLine) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(85, 85, 85);
    ensureSpace(6);
    doc.text(parsed.contactLine, margin, y);
    y += 9;
  } else {
    y += 3;
  }

  for (const section of parsed.sections) {
    const bodyLines = section.body.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!bodyLines.length) continue;

    if (section.heading) {
      // Reserve room for the heading, its rule, and at least one line of
      // content — otherwise a header could be drawn right at the bottom of
      // a page with nothing under it until the next page.
      ensureSpace(18);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(17, 17, 17);
      doc.text(section.heading, margin, y);
      y += 1.5;
      doc.setDrawColor(204, 204, 204);
      doc.line(margin, y, pageWidth - margin, y);
      y += 5;
    }

    if (section.heading === 'SUMMARY' || !section.heading) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(34, 34, 34);
      const wrapped = doc.splitTextToSize(bodyLines.join(' '), contentWidth);
      for (const line of wrapped) {
        ensureSpace(5);
        doc.text(line, margin, y);
        y += 5;
      }
      y += 3;
      continue;
    }

    for (const line of bodyLines) {
      if (line.startsWith('- ') || line.startsWith('• ')) {
        const bulletText = line.replace(/^[-•]\s*/, '');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10.5);
        doc.setTextColor(34, 34, 34);
        const wrapped = doc.splitTextToSize(bulletText, contentWidth - 5);
        wrapped.forEach((wLine, idx) => {
          ensureSpace(5);
          if (idx === 0) doc.text('•', margin, y);
          doc.text(wLine, margin + 5, y);
          y += 5;
        });
      } else if (section.heading === 'SKILLS' && line.includes(':')) {
        const idx = line.indexOf(':');
        const label = line.slice(0, idx + 1);
        const rest = line.slice(idx + 1).trim();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(17, 17, 17);
        ensureSpace(5.5);
        doc.text(label, margin, y);
        const labelWidth = doc.getTextWidth(`${label} `);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(34, 34, 34);
        doc.text(rest, margin + labelWidth, y);
        y += 5.5;
      } else {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(17, 17, 17);
        ensureSpace(5.5);
        doc.text(line, margin, y);
        y += 5.5;
      }
    }
    y += 3;
  }

  doc.save(slugifyResumeFilename(parsed.name));
}

downloadResumeBtn.addEventListener('click', () => {
  try {
    generateResumePdf();
  } catch (err) {
    setStatus('Could not generate the PDF. Please try again.', true);
  }
});
