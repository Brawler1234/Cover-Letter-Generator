const form = document.getElementById('letter-form');
const submitBtn = document.getElementById('submit-btn');
const statusEl = document.getElementById('status');
const resultSection = document.getElementById('result-section');
const resultEl = document.getElementById('result');

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
    setStatus('');
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    submitBtn.disabled = false;
  }
});
