document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const textInput = document.getElementById('textInput');
  const charCount = document.getElementById('charCount');
  const moderationForm = document.getElementById('moderationForm');
  const feedList = document.getElementById('feedList');
  const noDataView = document.getElementById('noDataView');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  
  // Stats elements
  const statTotal = document.getElementById('statTotal');
  const statApproved = document.getElementById('statApproved');
  const statFlagged = document.getElementById('statFlagged');
  const statLatency = document.getElementById('statLatency');
  
  // Settings & Modal elements
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const customApiKeyInput = document.getElementById('customApiKey');
  const apiKeyStatus = document.getElementById('apiKeyStatus');
  const clearKeyBtn = document.getElementById('clearKeyBtn');
  const saveKeyBtn = document.getElementById('saveKeyBtn');

  // Application State
  let jobs = [];
  const activePolls = new Set();
  
  // Initialize
  init();

  function init() {
    loadSavedApiKey();
    fetchJobsHistory();
    setupEventListeners();
  }

  // API Key Management
  function loadSavedApiKey() {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
      customApiKeyInput.value = savedKey;
      updateApiKeyStatusBadge(true);
    } else {
      customApiKeyInput.value = '';
      updateApiKeyStatusBadge(false);
    }
  }

  function updateApiKeyStatusBadge(hasCustom) {
    if (hasCustom) {
      apiKeyStatus.innerHTML = '<span class="status-badge status-custom">Using Custom Gemini API Key</span>';
    } else {
      apiKeyStatus.innerHTML = '<span class="status-badge status-default">Using Server Default Key</span>';
    }
  }

  function getCustomKey() {
    return localStorage.getItem('gemini_api_key') || '';
  }

  // Setup Event Listeners
  function setupEventListeners() {
    // Character count tracking
    textInput.addEventListener('input', () => {
      charCount.textContent = textInput.value.length;
    });

    // Form submission
    moderationForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = textInput.value.trim();
      if (!text) return;

      await submitTextForModeration(text);
      textInput.value = '';
      charCount.textContent = '0';
    });

    // Quick templates load & auto-submit
    document.querySelectorAll('.btn-template').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-text');
        textInput.value = text;
        charCount.textContent = text.length;
        textInput.focus();
        
        // Auto submit template
        submitTextForModeration(text);
        textInput.value = '';
        charCount.textContent = '0';
      });
    });

    // History cleaning
    clearHistoryBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear all moderation history?')) {
        try {
          const res = await fetch('/api/jobs/clear', { method: 'POST' });
          if (res.ok) {
            jobs = [];
            renderJobsFeed();
            updateStats();
          }
        } catch (err) {
          console.error('Error clearing history:', err);
        }
      }
    });

    // Modal behavior
    openSettingsBtn.addEventListener('click', () => {
      loadSavedApiKey();
      settingsModal.classList.add('active');
    });

    closeSettingsBtn.addEventListener('click', () => {
      settingsModal.classList.remove('active');
    });

    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) {
        settingsModal.classList.remove('active');
      }
    });

    saveKeyBtn.addEventListener('click', () => {
      const keyVal = customApiKeyInput.value.trim();
      if (keyVal) {
        localStorage.setItem('gemini_api_key', keyVal);
        updateApiKeyStatusBadge(true);
      } else {
        localStorage.removeItem('gemini_api_key');
        updateApiKeyStatusBadge(false);
      }
      settingsModal.classList.remove('active');
    });

    clearKeyBtn.addEventListener('click', () => {
      localStorage.removeItem('gemini_api_key');
      customApiKeyInput.value = '';
      updateApiKeyStatusBadge(false);
      settingsModal.classList.remove('active');
    });
  }

  // Fetch all history from server on load
  async function fetchJobsHistory() {
    try {
      const res = await fetch('/api/jobs');
      if (res.ok) {
        jobs = await res.json();
        renderJobsFeed();
        updateStats();
        
        // Re-poll any jobs that were left pending or processing
        jobs.forEach(job => {
          if (job.status === 'pending' || job.status === 'processing') {
            pollJobStatus(job.id);
          }
        });
      }
    } catch (err) {
      console.error('Error loading history:', err);
    }
  }

  // Submit text API call
  async function submitTextForModeration(text) {
    const customKey = getCustomKey();
    const headers = { 'Content-Type': 'application/json' };
    if (customKey) {
      headers['x-gemini-key'] = customKey;
    }

    try {
      const response = await fetch('/api/moderate', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        throw new Error('Failed to submit content');
      }

      const responseData = await response.json();
      
      // Add local preview to top of list
      const tempJob = {
        id: responseData.jobId,
        text: text,
        status: responseData.status,
        result: null,
        createdAt: new Date().toISOString()
      };

      jobs.unshift(tempJob);
      renderJobsFeed();
      updateStats();

      // Poll server for result
      pollJobStatus(tempJob.id);
    } catch (err) {
      console.error('Error submitting text:', err);
      // Inject failure preview
      const failJob = {
        id: 'fail_' + Date.now(),
        text: text,
        status: 'failed',
        result: {
          status: 'ERROR',
          reason: err.message
        },
        createdAt: new Date().toISOString()
      };
      jobs.unshift(failJob);
      renderJobsFeed();
      updateStats();
    }
  }

  // Poll status of single job
  function pollJobStatus(jobId) {
    if (activePolls.has(jobId)) return;
    activePolls.add(jobId);

    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        if (!response.ok) throw new Error('Job not found');
        
        const updatedJob = await response.json();
        
        // Find and update inside local state
        const index = jobs.findIndex(j => j.id === jobId);
        if (index !== -1) {
          jobs[index] = updatedJob;
          renderJobsFeed();
          updateStats();
        }

        if (updatedJob.status === 'completed' || updatedJob.status === 'failed') {
          activePolls.delete(jobId);
        } else {
          // Poll again in 1s
          setTimeout(checkStatus, 1000);
        }
      } catch (err) {
        console.error(`Error polling job ${jobId}:`, err);
        activePolls.delete(jobId);
        
        const index = jobs.findIndex(j => j.id === jobId);
        if (index !== -1) {
          jobs[index].status = 'failed';
          jobs[index].result = {
            status: 'ERROR',
            reason: 'Connection lost or API error.'
          };
          renderJobsFeed();
          updateStats();
        }
      }
    };

    // Run first check immediately
    checkStatus();
  }

  // Update statistics block
  function updateStats() {
    const total = jobs.length;
    const completedJobs = jobs.filter(j => j.status === 'completed');
    
    let approved = 0;
    let flagged = 0;
    let totalLatency = 0;
    let latencyCount = 0;

    jobs.forEach(job => {
      if (job.result) {
        if (job.result.status === 'APPROVED') approved++;
        if (job.result.status === 'FLAGGED') flagged++;
      }
      if (job.latencyMs !== null) {
        totalLatency += job.latencyMs;
        latencyCount++;
      }
    });

    statTotal.textContent = total;
    statApproved.textContent = total > 0 ? Math.round((approved / total) * 100) + '%' : '0%';
    statFlagged.textContent = total > 0 ? Math.round((flagged / total) * 100) + '%' : '0%';
    statLatency.textContent = latencyCount > 0 ? Math.round(totalLatency / latencyCount) + 'ms' : '0ms';
  }

  // Render jobs to UI feed
  function renderJobsFeed() {
    if (jobs.length === 0) {
      noDataView.style.display = 'flex';
      feedList.style.display = 'none';
      return;
    }

    noDataView.style.display = 'none';
    feedList.style.display = 'flex';
    
    feedList.innerHTML = '';

    jobs.forEach(job => {
      const card = document.createElement('div');
      card.className = `feed-card card-${job.status.toLowerCase()}`;
      
      // Determine Badge
      let badgeHtml = '';
      if (job.status === 'pending' || job.status === 'processing') {
        badgeHtml = `<span class="badge badge-pending"><span class="spinner"></span>${job.status}</span>`;
      } else if (job.status === 'completed') {
        const isApproved = job.result?.status === 'APPROVED';
        badgeHtml = isApproved 
          ? `<span class="badge badge-approved"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>Approved</span>`
          : `<span class="badge badge-flagged"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>Flagged</span>`;
      } else {
        badgeHtml = `<span class="badge badge-error">Error</span>`;
      }

      // Format Date
      const dateStr = new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      // Latency markup
      const latencyStr = job.latencyMs !== null ? `${job.latencyMs}ms` : '';

      // Explanation
      let explanationHtml = '';
      if (job.status === 'completed' && job.result) {
        explanationHtml = `<div class="explanation-box">${escapeHtml(job.result.reason)}</div>`;
      } else if (job.status === 'failed' && job.result) {
        explanationHtml = `<div class="explanation-box" style="color: var(--accent-red); border-color: rgba(239, 68, 68, 0.15);">${escapeHtml(job.result.reason)}</div>`;
      } else if (job.status === 'processing') {
        explanationHtml = `<div class="explanation-box" style="font-style: italic; color: var(--text-muted);">AI is evaluating the content context...</div>`;
      } else {
        explanationHtml = `<div class="explanation-box" style="font-style: italic; color: var(--text-muted);">Queued in pipeline. Waiting for process thread...</div>`;
      }

      card.innerHTML = `
        <div class="feed-card-header">
          ${badgeHtml}
          <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">${dateStr}</span>
        </div>
        <div class="feed-text">"${escapeHtml(job.text)}"</div>
        ${explanationHtml}
        <div class="feed-card-meta">
          <span>ID: ${job.id}</span>
          <span>${latencyStr}</span>
        </div>
      `;
      
      feedList.appendChild(card);
    });
  }

  // Simple HTML escaping to prevent XSS
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
