(() => {
  const container = document.querySelector('#lessonContent');
  const id = new URLSearchParams(location.search).get('id');
  const token = localStorage.getItem('vortex-english-token') || '';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const labels = { beginner: 'Beginner', elementary: 'Elementary', ielts: 'IELTS', listening: 'Listening', speaking: 'Speaking', reading: 'Reading', writing: 'Writing', video: 'Video', pdf: 'PDF', audio: 'Audio', article: 'Article', book: 'Book', sample: 'Sample' };
  let readerState = null;

  const fail = (message, title = 'We could not open this material.') => {
    container.innerHTML = `<div class="empty"><div><h1>${escape(title)}</h1><p>${escape(message)}</p><a class="button secondary" href="/english/materials">Back to library</a></div></div>`;
  };
  const api = async (url, options = {}) => {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
    return data;
  };
  const contentUrl = (item, part) => {
    const url = new URL('/english/content-file', location.origin);
    url.searchParams.set('id', item.id); url.searchParams.set('part', part.key); url.searchParams.set('token', token);
    return `${url.pathname}${url.search}`;
  };
  const metaMarkup = item => `<div class="lesson-meta"><span class="resource-badge primary">${escape(labels[item.grade] || item.grade)}</span><span class="resource-badge">${escape(labels[item.skill] || item.skill || 'General')}</span><span class="resource-badge">${escape(item.formatLabel || labels[item.type] || item.type)}</span></div>`;
  const warningMarkup = item => item.contentWarning ? `<div class="lesson-warning"><span class="material-symbols-outlined" aria-hidden="true">warning</span><span><strong>Content note</strong>${escape(item.contentWarning)}</span></div>` : '';
  const toast = message => {
    let notice = document.querySelector('.reader-toast');
    if (!notice) { notice = document.createElement('div'); notice.className = 'reader-toast'; notice.setAttribute('role', 'status'); document.body.append(notice); }
    notice.textContent = message; notice.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => notice.classList.remove('show'), 3200);
  };

  const renderPdfViewer = (item, options = {}) => {
    const parts = Array.isArray(item.parts) ? item.parts : [];
    const firstPart = parts[0];
    let viewer = '';
    let openUrl = item.url || '';
    if (firstPart) {
      openUrl = contentUrl(item, firstPart);
      const tabs = parts.length > 1 ? `<div class="lesson-tabs" role="tablist" aria-label="Material sections">${parts.map((part, index) => `<button type="button" role="tab" aria-selected="${index === 0}" data-part="${escape(part.key)}">${escape(part.label || part.key)}</button>`).join('')}</div>` : '';
      viewer = `${tabs}<iframe title="${escape(item.title)}" src="${escape(openUrl)}" loading="eager" referrerpolicy="no-referrer"></iframe>`;
    } else if (item.type === 'audio') {
      viewer = `<div class="lesson-media"><audio controls preload="metadata" src="${escape(item.url)}">Your browser does not support the audio player.</audio></div>`;
    } else if (item.type === 'video' && /\.(mp4|webm|ogg)(\?|$)/i.test(item.url)) {
      viewer = `<div class="lesson-media"><video controls preload="metadata" src="${escape(item.url)}"></video></div>`;
    } else {
      viewer = `<iframe title="${escape(item.title)}" src="${escape(item.url)}" loading="eager" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    }
    const articleNote = item.collection !== 'article' ? '' : options.premiumReaderUnavailable
      ? '<div class="free-reader-note"><span class="material-symbols-outlined" aria-hidden="true">verified</span><div><strong>Quality-checked original</strong><p>This scan stays in its original layout until its interactive text edition passes review.</p></div></div>'
      : '<div class="free-reader-note"><span class="material-symbols-outlined" aria-hidden="true">auto_stories</span><div><strong>Original PDF view</strong><p>Interactive reading, saved highlights and My Vocabulary are included with Premium.</p></div></div>';
    container.innerHTML = `<div class="lesson-header"><div><p class="page-kicker">LEARNING MATERIAL</p><h1>${escape(item.title)}</h1>${metaMarkup(item)}</div></div><div class="lesson-layout"><section class="lesson-viewer">${viewer}</section><aside class="lesson-side">${warningMarkup(item)}<h2>About this material</h2><p>${escape(item.description || 'This material has been selected for focused practice.')}</p>${articleNote}<a class="button secondary" id="openLessonPart" href="${escape(openUrl)}" target="_blank" rel="noopener noreferrer">Open in a new tab</a><a class="button primary" href="/english/materials?level=${encodeURIComponent(item.grade)}&skill=${encodeURIComponent(item.skill || 'all')}&collection=${encodeURIComponent(item.collection || 'all')}">More materials</a></aside></div>`;
    if (parts.length > 1) {
      const frame = container.querySelector('.lesson-viewer iframe');
      const openLink = container.querySelector('#openLessonPart');
      container.querySelectorAll('[data-part]').forEach(button => button.addEventListener('click', () => {
        const part = parts.find(entry => entry.key === button.dataset.part); if (!part) return;
        const nextUrl = contentUrl(item, part); frame.src = nextUrl; frame.title = `${item.title} — ${part.label || part.key}`; openLink.href = nextUrl;
        container.querySelectorAll('[data-part]').forEach(tab => tab.setAttribute('aria-selected', String(tab === button)));
      }));
    }
  };

  const highlightedMarkup = (block, highlights) => {
    const ranges = highlights.filter(item => item.blockId === block.id).sort((a, b) => a.start - b.start || b.end - a.end);
    let cursor = 0;
    return ranges.map(item => {
      if (item.start < cursor || item.end > block.text.length) return '';
      const before = escape(block.text.slice(cursor, item.start));
      const marked = `<mark class="saved-highlight highlight-${escape(item.color)}" data-highlight-id="${escape(item.id)}" title="Click to remove this highlight">${escape(block.text.slice(item.start, item.end))}</mark>`;
      cursor = item.end;
      return before + marked;
    }).join('') + escape(block.text.slice(cursor));
  };

  const renderReaderBlocks = () => {
    const articleBody = container.querySelector('#interactiveArticleBody');
    if (!articleBody || !readerState) return;
    const titleKey = readerState.item.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    articleBody.innerHTML = readerState.article.blocks.map(block => {
      const textKey = block.text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!textKey || (block.kind === 'heading' && textKey === titleKey)) return '';
      const tag = block.kind === 'heading' ? 'h2' : 'p';
      return `<${tag} class="article-block" data-block-id="${escape(block.id)}">${highlightedMarkup(block, readerState.highlights)}</${tag}>`;
    }).join('');
  };

  const selectionDetails = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    const elementFor = node => node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const startBlock = elementFor(range.startContainer)?.closest('.article-block');
    const endBlock = elementFor(range.endContainer)?.closest('.article-block');
    if (!startBlock || startBlock !== endBlock) return null;
    const before = document.createRange(); before.selectNodeContents(startBlock); before.setEnd(range.startContainer, range.startOffset);
    const start = before.toString().length; const text = range.toString().trim();
    if (!text) return null;
    const leading = range.toString().indexOf(text);
    const rect = range.getBoundingClientRect();
    return { blockId: startBlock.dataset.blockId, start: start + Math.max(0, leading), end: start + Math.max(0, leading) + text.length, text, rect };
  };

  const hideSelectionTools = () => container.querySelector('#readerSelectionTools')?.classList.remove('show');
  const showSelectionTools = () => {
    const details = selectionDetails();
    const tools = container.querySelector('#readerSelectionTools');
    if (!details || !tools) { hideSelectionTools(); return; }
    readerState.selection = details;
    const left = Math.min(window.innerWidth - tools.offsetWidth - 12, Math.max(12, details.rect.left + details.rect.width / 2 - tools.offsetWidth / 2));
    const top = Math.max(12, details.rect.top - tools.offsetHeight - 10);
    tools.style.left = `${left}px`; tools.style.top = `${top}px`; tools.classList.add('show');
  };

  const bindReader = () => {
    const tools = container.querySelector('#readerSelectionTools');
    container.querySelectorAll('[data-reader-view]').forEach(button => button.addEventListener('click', () => {
      const view = button.dataset.readerView;
      container.querySelectorAll('[data-reader-view]').forEach(tab => tab.setAttribute('aria-selected', String(tab === button)));
      container.querySelector('#readerReadingView').hidden = view !== 'reading';
      container.querySelector('#readerPdfView').hidden = view !== 'pdf';
      hideSelectionTools();
    }));
    const choose = () => setTimeout(showSelectionTools, 0);
    container.querySelector('#interactiveArticleBody').addEventListener('mouseup', choose);
    container.querySelector('#interactiveArticleBody').addEventListener('touchend', choose, { passive: true });
    tools.addEventListener('mousedown', event => event.preventDefault());
    tools.addEventListener('click', async event => {
      const action = event.target.closest('[data-reader-action]')?.dataset.readerAction;
      const selected = readerState.selection;
      if (!action || !selected) return;
      try {
        if (action === 'highlight') {
          const data = await api('/api/article-highlights', { method: 'POST', body: JSON.stringify({ articleId: readerState.item.id, blockId: selected.blockId, start: selected.start, end: selected.end, color: 'yellow' }) });
          if (!readerState.highlights.some(item => item.id === data.highlight.id)) readerState.highlights.push(data.highlight);
          renderReaderBlocks(); toast('Highlight saved to this article.');
        } else {
          const data = await api('/api/vocabulary', { method: 'POST', body: JSON.stringify({ articleId: readerState.item.id, blockId: selected.blockId, start: selected.start, end: selected.end }) });
          if (!readerState.vocabulary.some(item => item.id === data.vocabularyItem.id)) readerState.vocabulary.unshift(data.vocabularyItem);
          container.querySelector('#articleVocabularyCount').textContent = String(readerState.vocabulary.length);
          toast(data.duplicate ? 'This word is already in My Vocabulary.' : 'Added to My Vocabulary.');
        }
      } catch (error) { toast(error.message); }
      window.getSelection()?.removeAllRanges(); hideSelectionTools();
    });
    container.querySelector('#interactiveArticleBody').addEventListener('click', async event => {
      const mark = event.target.closest('[data-highlight-id]');
      if (!mark || !confirm('Remove this highlight?')) return;
      try {
        await api(`/api/article-highlights/${encodeURIComponent(mark.dataset.highlightId)}`, { method: 'DELETE' });
        readerState.highlights = readerState.highlights.filter(item => item.id !== mark.dataset.highlightId);
        renderReaderBlocks(); toast('Highlight removed.');
      } catch (error) { toast(error.message); }
    });
    document.addEventListener('scroll', hideSelectionTools, true);
  };

  const renderInteractiveReader = (item, payload) => {
    readerState = { item, article: payload.article, highlights: payload.highlights || [], vocabulary: payload.vocabulary || [], selection: null };
    const parts = Array.isArray(item.parts) ? item.parts : [];
    const articlePart = parts.find(part => part.key === 'article') || parts[0];
    const originalUrl = articlePart ? contentUrl(item, articlePart) : '';
    container.innerHTML = `<div class="lesson-header article-lesson-header"><div><p class="page-kicker">PREMIUM ARTICLE READER</p><h1>${escape(item.title)}</h1>${metaMarkup(item)}</div><a class="vocabulary-shortcut" href="/english/vocabulary"><span class="material-symbols-outlined" aria-hidden="true">bookmarks</span><span>My Vocabulary</span><strong id="articleVocabularyCount">${readerState.vocabulary.length}</strong></a></div><div class="article-reader-layout"><section class="interactive-reader"><div class="reader-view-tabs" role="tablist" aria-label="Article view"><button type="button" role="tab" aria-selected="true" data-reader-view="reading"><span class="material-symbols-outlined" aria-hidden="true">auto_stories</span>Reading view</button><button type="button" role="tab" aria-selected="false" data-reader-view="pdf"><span class="material-symbols-outlined" aria-hidden="true">picture_as_pdf</span>Original PDF</button></div><div id="readerReadingView" class="reader-reading-view"><div class="reader-intro"><span>Interactive reading</span><p>Select a word or sentence to highlight it or save it to My Vocabulary.</p></div><article id="interactiveArticleBody" class="interactive-article" aria-label="${escape(item.title)}"></article></div><div id="readerPdfView" class="reader-pdf-view" hidden><iframe title="Original PDF — ${escape(item.title)}" src="${escape(originalUrl)}" loading="lazy" referrerpolicy="no-referrer"></iframe></div></section><aside class="article-tools-panel">${warningMarkup(item)}<p class="page-kicker">READING TOOLS</p><h2>Make the article yours.</h2><ul><li><span class="material-symbols-outlined" aria-hidden="true">ink_highlighter</span><span><strong>Saved highlights</strong>Stay visible when you return.</span></li><li><span class="material-symbols-outlined" aria-hidden="true">bookmarks</span><span><strong>My Vocabulary</strong>Collect new words with their original context.</span></li><li><span class="material-symbols-outlined" aria-hidden="true">cloud_done</span><span><strong>Synced to your account</strong>Continue on another device.</span></li></ul><a class="button primary" href="/english/vocabulary">Open My Vocabulary</a><a class="button secondary" href="/english/materials?collection=article">More articles</a></aside></div><div class="reader-selection-tools" id="readerSelectionTools" role="toolbar" aria-label="Selected text actions"><button type="button" data-reader-action="highlight"><span class="material-symbols-outlined" aria-hidden="true">ink_highlighter</span>Highlight</button><button type="button" data-reader-action="vocabulary"><span class="material-symbols-outlined" aria-hidden="true">bookmark_add</span>Add word</button></div>`;
    renderReaderBlocks(); bindReader();
  };

  if (!id) { fail('The material identifier is missing.'); return; }
  if (!token) { location.replace(`/english/login?next=${encodeURIComponent(location.pathname + location.search)}`); return; }

  Promise.all([api('/api/auth/me'), api('/api/resources')])
    .then(async ([me, resources]) => {
      const item = resources.find(resource => resource.id === id);
      if (!item) { fail('This material was not found or has been removed.'); return; }
      if (item.locked) { fail('Upgrade to Premium to open this material.', 'Premium access required.'); return; }
      if (item.collection === 'article') {
        try {
          const readerData = await api(`/api/article-reader?id=${encodeURIComponent(item.id)}`);
          renderInteractiveReader(item, readerData);
          return;
        } catch (_) {
          renderPdfViewer(item, { premiumReaderUnavailable: true });
          return;
        }
      }
      renderPdfViewer(item);
    })
    .catch(error => fail(error.message || 'There was a problem connecting to the server.'));
})();
