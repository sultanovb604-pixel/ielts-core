(() => {
  const token = localStorage.getItem('vortex-english-token');
  if (!token) { location.replace('/english/login?next=/english/vocabulary'); return; }
  const list = document.querySelector('#vocabularyList');
  const search = document.querySelector('#vocabularySearch');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  let words = [];
  let filter = 'all';
  const api = async (url, options = {}) => {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
    return data;
  };
  const contextMarkup = item => {
    const context = String(item.context || '');
    const target = String(item.word || '');
    const index = context.toLocaleLowerCase('en').indexOf(target.toLocaleLowerCase('en'));
    if (index < 0) return escape(context);
    return `${escape(context.slice(0, index))}<mark>${escape(context.slice(index, index + target.length))}</mark>${escape(context.slice(index + target.length))}`;
  };
  const updateSummary = () => {
    document.querySelector('#vocabularyTotal').textContent = String(words.length);
    document.querySelector('#vocabularyMastered').textContent = String(words.filter(item => item.status === 'mastered').length);
  };
  const render = () => {
    const query = search.value.trim().toLocaleLowerCase('en');
    const visible = words.filter(item => (filter === 'all' || item.status === filter) && (!query || `${item.word} ${item.context} ${item.articleTitle}`.toLocaleLowerCase('en').includes(query)));
    updateSummary();
    if (!words.length) {
      list.innerHTML = '<div class="vocabulary-empty"><div><span class="material-symbols-outlined" aria-hidden="true">bookmarks</span><h2>Your word bank is ready.</h2><p>Open a Premium article, select a new word and choose <strong>Add word</strong>. Its original sentence will be saved here.</p><a class="button primary" href="/english/materials?collection=article">Explore articles</a></div></div>';
      return;
    }
    if (!visible.length) {
      list.innerHTML = '<div class="vocabulary-empty"><div><span class="material-symbols-outlined" aria-hidden="true">search_off</span><h2>No matching words.</h2><p>Try another search or change the learning filter.</p></div></div>';
      return;
    }
    list.innerHTML = visible.map(item => `<article class="vocabulary-card" data-word-id="${escape(item.id)}"><div class="vocabulary-word"><h2>${escape(item.word)}</h2><a href="/english/lesson?id=${encodeURIComponent(item.articleId)}">${escape(item.articleTitle || 'Open source article')} →</a></div><p class="vocabulary-context">${contextMarkup(item)}</p><div class="vocabulary-actions"><button type="button" class="${item.status === 'mastered' ? 'mastered' : ''}" data-word-status="${item.status === 'mastered' ? 'learning' : 'mastered'}">${item.status === 'mastered' ? 'Mastered' : 'Mark mastered'}</button><button type="button" class="delete-word" data-word-delete aria-label="Remove ${escape(item.word)}"><span class="material-symbols-outlined" aria-hidden="true">delete</span></button></div></article>`).join('');
  };
  document.querySelectorAll('[data-vocabulary-filter]').forEach(button => button.addEventListener('click', () => {
    filter = button.dataset.vocabularyFilter;
    document.querySelectorAll('[data-vocabulary-filter]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    render();
  }));
  search.addEventListener('input', render);
  list.addEventListener('click', async event => {
    const card = event.target.closest('[data-word-id]'); if (!card) return;
    const item = words.find(entry => entry.id === card.dataset.wordId); if (!item) return;
    try {
      const statusButton = event.target.closest('[data-word-status]');
      if (statusButton) {
        const data = await api(`/api/vocabulary/${encodeURIComponent(item.id)}`, { method: 'PUT', body: JSON.stringify({ status: statusButton.dataset.wordStatus }) });
        Object.assign(item, data.vocabularyItem); render(); return;
      }
      if (event.target.closest('[data-word-delete]') && confirm(`Remove “${item.word}” from My Vocabulary?`)) {
        await api(`/api/vocabulary/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
        words = words.filter(entry => entry.id !== item.id); render();
      }
    } catch (error) { alert(error.message); }
  });
  api('/api/vocabulary').then(data => { words = data.vocabulary || []; render(); }).catch(error => { list.innerHTML = `<div class="vocabulary-empty"><div><h2>My Vocabulary could not load.</h2><p>${escape(error.message)}</p></div></div>`; });
})();
