/* Business tools: filter existing cards without rebuilding forms or changing plan gates. */
(function () {
  'use strict';

  function normalize(value) {
    return String(value || '').toLowerCase().replace(/&/g, ' and ').replace(/\s+/g, ' ').trim();
  }

  function bind(root) {
    const input = root.querySelector('#businessToolSearch');
    const clear = root.querySelector('#businessToolSearchClear');
    const status = root.querySelector('#businessToolSearchStatus');
    const results = root.querySelector('#businessToolResults');
    if (!input || !clear || !status || !results || input.dataset.bound) return;
    input.dataset.bound = 'true';

    function filter() {
      const terms = normalize(input.value).split(' ').filter(Boolean);
      let count = 0;
      results.querySelectorAll('.vx621-group').forEach(function (group) {
        let visible = 0;
        const heading = group.querySelector('h2');
        group.querySelectorAll('.vx621-feature-card').forEach(function (card) {
          const text = normalize((heading ? heading.textContent : '') + ' ' + card.textContent);
          const matches = terms.every(function (term) { return text.includes(term); });
          card.hidden = !matches;
          if (matches) visible++;
        });
        group.hidden = visible === 0;
        count += visible;
      });
      clear.hidden = !input.value;
      status.textContent = !terms.length ? '' : count
        ? count + (count === 1 ? ' tool found' : ' tools found')
        : 'No tools found. Try sale, purchase, customer or tax.';
    }

    function reset() {
      input.value = '';
      filter();
      input.focus();
    }

    input.addEventListener('input', filter);
    input.addEventListener('search', filter);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && input.value) {
        event.preventDefault();
        event.stopPropagation();
        reset();
      }
    });
    clear.addEventListener('click', reset);
  }

  window.VyaparBusinessTools = { bind: bind };
})();
