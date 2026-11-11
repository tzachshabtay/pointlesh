/** Add an in-place search to long native selects without changing their value or change handlers. */
export function installDesignerSelectSearch(root: HTMLElement, minimumOptions = 10) {
  const document = root.ownerDocument;
  const style = document.createElement('style');
  style.textContent = '.scene-designer__row.pointlesh-select-search-row{flex-wrap:wrap}.scene-designer__row.pointlesh-select-search-row>.pointlesh-select-search{flex:0 0 100%}';
  root.append(style);
  const records = new Map<HTMLSelectElement, { input: HTMLInputElement; originals: WeakMap<HTMLOptionElement, { hidden: boolean; disabled: boolean }>; cleanup(): void; filter(): void }>();
  let scheduled = false;
  const scan = () => {
    scheduled = false;
    for (const [select, record] of records) {
      if (!root.contains(select)) { record.cleanup(); records.delete(select); continue; }
      record.filter();
    }
    for (const select of root.querySelectorAll<HTMLSelectElement>('select')) {
      if (select.hidden || select.multiple || select.size > 1 || select.options.length < minimumOptions || select.dataset.pointleshSearch === 'true') continue;
      const input = document.createElement('input'); input.type = 'search'; input.className = 'pointlesh-select-search';
      const name = select.getAttribute('aria-label') || select.closest('label')?.querySelector(':scope > span')?.textContent?.trim() || 'options';
      input.placeholder = `Search ${name.toLowerCase()}…`;
      input.setAttribute('aria-label', `Search ${name.toLowerCase()}`);
      input.autocomplete = 'off';
      input.style.cssText = 'display:block;box-sizing:border-box;width:100%;min-width:0;margin:0 0 4px;padding:6px 8px;font:inherit;color:#e6eaf2;background:#161f2c;border:1px solid #59677d;border-radius:5px';
      select.before(input);
      if (select.parentElement?.classList.contains('scene-designer__row')) select.parentElement.classList.add('pointlesh-select-search-row');
      select.dataset.pointleshSearch = 'true';
      const originals = new WeakMap<HTMLOptionElement, { hidden: boolean; disabled: boolean }>();
      const filter = () => {
        const query = input.value.trim().toLocaleLowerCase();
        let matches = 0;
        for (const option of select.options) {
          let original = originals.get(option);
          if (!original) { original = { hidden: option.hidden, disabled: option.disabled }; originals.set(option, original); }
          const match = !query || `${option.textContent ?? ''} ${option.dataset.searchText ?? ''}`.toLocaleLowerCase().includes(query);
          if (match && !original.hidden) matches++;
          option.hidden = original.hidden || (!match && !option.selected);
          option.disabled = original.disabled || (!match && !option.selected);
        }
        input.setAttribute('aria-description', query ? `${matches} matching options. The current selection remains available.` : 'Type to filter options.');
      };
      const changed = () => { input.value = ''; filter(); };
      input.addEventListener('input', filter);
      select.addEventListener('change', changed);
      records.set(select, { input, originals, filter, cleanup() {
        input.removeEventListener('input', filter); select.removeEventListener('change', changed);
        input.remove(); delete select.dataset.pointleshSearch;
        if (!select.parentElement?.querySelector(':scope > .pointlesh-select-search')) select.parentElement?.classList.remove('pointlesh-select-search-row');
        for (const option of select.options) { const original = originals.get(option); if (original) { option.hidden = original.hidden; option.disabled = original.disabled; } }
      } });
    }
  };
  const observer = new document.defaultView!.MutationObserver(mutations => {
    if (scheduled || !mutations.some(mutation => mutation.target.nodeType === 1 && (mutation.target as Element).tagName === 'SELECT' || [...mutation.addedNodes, ...mutation.removedNodes].some(node =>
      node.nodeType === 1 && ((node as Element).tagName === 'SELECT' || !!(node as Element).querySelector('select'))))) return;
    scheduled = true; queueMicrotask(scan);
  });
  observer.observe(root, { childList: true, subtree: true });
  scan();
  return { refresh: scan, destroy() { observer.disconnect(); for (const record of records.values()) record.cleanup(); records.clear(); style.remove(); } };
}
