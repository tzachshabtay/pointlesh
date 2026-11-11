/** Search long native selects in a compact dropdown while retaining their change handlers. */
export function installDesignerSelectSearch(root: HTMLElement, minimumOptions = 10) {
  const document = root.ownerDocument;
  const records = new Map<HTMLSelectElement, { refresh(): void; destroy(): void }>();
  let scheduled = false;

  function enhance(select: HTMLSelectElement) {
    const name = select.getAttribute('aria-label') || select.closest('label')?.querySelector(':scope > span')?.textContent?.trim() || 'options';
    const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'pointlesh-select-trigger';
    trigger.setAttribute('aria-label', name); trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false');
    trigger.style.cssText = 'box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-width:0;text-align:left;white-space:normal;overflow-wrap:anywhere;padding:7px 10px;font:inherit;color:#e6eaf2;background:#202938;border:1px solid #59677d;border-radius:5px;cursor:pointer';
    const triggerLabel = document.createElement('span'); triggerLabel.style.cssText = 'min-width:0;overflow-wrap:anywhere';
    const triggerArrow = document.createElement('span'); triggerArrow.textContent = '▾'; triggerArrow.setAttribute('aria-hidden', 'true');
    triggerArrow.style.cssText = 'flex:none;margin-left:auto';
    trigger.append(triggerLabel, triggerArrow);
    const panel = document.createElement('div'); panel.className = 'pointlesh-select-menu'; panel.hidden = true;
    panel.style.cssText = 'position:fixed;z-index:2147483646;box-sizing:border-box;padding:8px;background:#202938;color:#e6eaf2;border:1px solid #72839e;border-radius:6px;box-shadow:0 10px 28px #000a;font:13px system-ui';
    const search = document.createElement('input'); search.type = 'search'; search.autocomplete = 'off';
    search.placeholder = `Search ${name.toLowerCase()}…`; search.setAttribute('aria-label', `Search ${name.toLowerCase()}`);
    search.style.cssText = 'box-sizing:border-box;width:100%;margin-bottom:7px;padding:8px;font:inherit;color:#e6eaf2;background:#111722;border:1px solid #72839e;border-radius:4px';
    const list = document.createElement('div'); list.id = `pointlesh-select-${crypto.randomUUID()}`;
    list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', name);
    list.style.cssText = 'display:grid;gap:3px;max-height:240px;overflow:auto';
    const empty = document.createElement('div'); empty.textContent = 'No matching options.'; empty.setAttribute('role', 'status');
    trigger.setAttribute('aria-controls', list.id);
    search.setAttribute('role', 'combobox'); search.setAttribute('aria-controls', list.id); search.setAttribute('aria-autocomplete', 'list');
    panel.append(search, list, empty);
    select.after(trigger); select.hidden = true; select.dataset.pointleshSearch = 'true';
    let matches: HTMLOptionElement[] = [], buttons: HTMLButtonElement[] = [], active = -1;

    const refresh = () => {
      const selected = select.selectedOptions[0];
      triggerLabel.textContent = selected?.dataset.searchText || selected?.textContent || 'Choose an option';
      const description = select.getAttribute('aria-description');
      if (description) {
        trigger.dataset.pointleshFieldHelp = description;
        trigger.setAttribute('aria-description', description);
      }
      trigger.disabled = select.disabled;
      if (select.disabled) close();
    };
    const position = () => {
      const bounds = trigger.getBoundingClientRect(), view = document.defaultView!;
      const width = Math.min(Math.max(bounds.width, 240), view.innerWidth - 16);
      panel.style.width = `${width}px`;
      panel.style.left = `${Math.max(8, Math.min(bounds.left, view.innerWidth - width - 8))}px`;
      const height = panel.offsetHeight;
      panel.style.top = `${bounds.bottom + height + 8 <= view.innerHeight ? bounds.bottom + 3 : Math.max(8, bounds.top - height - 3)}px`;
    };
    const close = (focus = false) => {
      if (panel.hidden) return;
      panel.hidden = true; panel.remove(); trigger.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', outside, true);
      document.defaultView!.removeEventListener('resize', position);
      if (focus) trigger.focus();
    };
    const highlight = (index: number) => {
      active = index;
      buttons.forEach((button, i) => { button.style.background = i === active ? '#41516a' : '#293344'; });
      const button = buttons[active];
      if (button) { search.setAttribute('aria-activedescendant', button.id); button.scrollIntoView({ block: 'nearest' }); }
      else search.removeAttribute('aria-activedescendant');
    };
    const choose = (option: HTMLOptionElement) => {
      select.value = option.value; close(true); refresh();
      select.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const filter = () => {
      const query = search.value.trim().toLocaleLowerCase();
      matches = [...select.options].filter(option => !option.disabled && !option.hidden &&
        `${option.textContent ?? ''} ${option.dataset.searchText ?? ''}`.toLocaleLowerCase().includes(query));
      list.replaceChildren();
      buttons = matches.map((option, index) => {
        const button = document.createElement('button'); button.type = 'button'; button.id = `${list.id}-${index}`;
        button.setAttribute('role', 'option'); button.setAttribute('aria-selected', String(option.value === select.value));
        button.textContent = option.dataset.searchText || option.textContent;
        button.style.cssText = 'width:100%;text-align:left;white-space:normal;overflow-wrap:anywhere;padding:8px;font:inherit;color:inherit;border:0;border-radius:4px;cursor:pointer';
        button.onpointermove = () => highlight(index);
        button.onclick = event => { event.preventDefault(); event.stopPropagation(); choose(option); };
        list.append(button); return button;
      });
      empty.hidden = matches.length > 0;
      highlight(matches.length ? Math.max(0, matches.findIndex(option => option.value === select.value)) : -1);
      position();
    };
    const outside = (event: PointerEvent) => { if (!panel.contains(event.target as Node) && !trigger.contains(event.target as Node)) close(); };
    const open = () => {
      if (select.disabled) return;
      (select.closest('dialog') ?? document.body).append(panel);
      panel.hidden = false; trigger.setAttribute('aria-expanded', 'true');
      search.value = ''; filter(); search.focus();
      document.addEventListener('pointerdown', outside, true);
      document.defaultView!.addEventListener('resize', position);
    };
    trigger.onclick = event => { event.preventDefault(); event.stopPropagation(); panel.hidden ? open() : close(); };
    trigger.onkeydown = event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); open(); } };
    search.oninput = filter;
    panel.onkeydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); if (matches.length) highlight((active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
      } else if (event.key === 'Enter') { event.preventDefault(); if (matches[active]) choose(matches[active]); }
    };
    select.addEventListener('change', refresh);
    refresh();
    return { refresh: () => { refresh(); if (!panel.hidden) filter(); }, destroy() {
      close(); select.removeEventListener('change', refresh); trigger.remove(); delete select.dataset.pointleshSearch; select.hidden = false;
    } };
  }

  const scan = () => {
    scheduled = false;
    for (const [select, record] of records) {
      if (!root.contains(select)) { record.destroy(); records.delete(select); }
      else record.refresh();
    }
    for (const select of root.querySelectorAll<HTMLSelectElement>('select')) {
      if (select.hidden || select.multiple || select.size > 1 || select.options.length < minimumOptions || select.dataset.pointleshSearch === 'true') continue;
      records.set(select, enhance(select));
    }
  };
  const observer = new document.defaultView!.MutationObserver(mutations => {
    if (scheduled || !mutations.some(mutation => mutation.target.nodeType === 1 && (mutation.target as Element).tagName === 'SELECT' || [...mutation.addedNodes, ...mutation.removedNodes].some(node =>
      node.nodeType === 1 && ((node as Element).tagName === 'SELECT' || !!(node as Element).querySelector('select'))))) return;
    scheduled = true; queueMicrotask(scan);
  });
  observer.observe(root, { childList: true, subtree: true });
  scan();
  return { refresh: scan, destroy() { observer.disconnect(); for (const record of records.values()) record.destroy(); records.clear(); } };
}
