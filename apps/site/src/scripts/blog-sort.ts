export function initializeBlogSort(): void {
  const select = document.querySelector<HTMLSelectElement>('#blog-sort');
  const picker = document.querySelector<HTMLElement>('.sort-picker');
  if (!select || !picker) return;
  const trigger = picker.querySelector<HTMLButtonElement>('.sort-trigger')!;
  const list = picker.querySelector<HTMLElement>('[role=listbox]')!;
  const options = [...list.querySelectorAll<HTMLButtonElement>('[role=option]')];
  let open = false;
  let animation: Animation | undefined;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  function close(restoreFocus = false) {
    open = false;
    trigger.setAttribute('aria-expanded', 'false');
    animation?.cancel();
    list.hidden = true;
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }
  function show(keyboard = false) {
    animation?.cancel();
    open = true;
    list.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    list.dataset.side = 'bottom';
    if (list.getBoundingClientRect().bottom > innerHeight - 12 && trigger.getBoundingClientRect().top > list.offsetHeight + 12) list.dataset.side = 'top';
    options.find(option => option.dataset.value === select!.value)?.focus({ preventScroll: true });
    if (!keyboard && !reducedMotion.matches) {
      const offset = list.dataset.side === 'top' ? '4px' : '-4px';
      animation = list.animate([{ opacity: 0, transform: `translateY(${offset}) scale(.98)` }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: 150, easing: 'cubic-bezier(.16,1,.3,1)' });
    }
  }
  trigger.addEventListener('click', event => open ? close() : show(event.detail === 0));
  trigger.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(true); }
  });
  options.forEach(option => option.addEventListener('click', () => {
    select!.value = option.dataset.value!;
    picker!.querySelector('#sort-value')!.textContent = option.querySelector('span')!.textContent;
    options.forEach(item => item.setAttribute('aria-selected', String(item === option)));
    select!.dispatchEvent(new Event('change', { bubbles: true }));
    close(true);
  }));
  list.addEventListener('keydown', event => {
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options[next].focus();
    }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    if (event.key === 'Tab') { close(true); }
  });
  document.addEventListener('pointerdown', event => { if (open && !picker!.contains(event.target as Node)) close(); });
  picker.addEventListener('focusout', event => { if (open && !picker.contains(event.relatedTarget as Node)) close(); });
  select.hidden = true;
  picker.hidden = false;
  document.querySelector<HTMLLabelElement>('#blog-sort-label')?.removeAttribute('for');
}
