/** Progressive enhancement: the document starts with complete, inline figures. */
export function initializeShowcase() {
  const root = document.querySelector<HTMLElement>('[data-showcase]');
  if (!root) return;
  const steps = [...root.querySelectorAll<HTMLElement>('[data-step]')];
  const slides = [...root.querySelectorAll<HTMLElement>('[data-slide]')];
  const stage = root.querySelector<HTMLElement>('.showcase-stage')!;
  const wide = matchMedia('(min-width: 1100px)');
  let pending = false;
  function select(index: number) {
    steps.forEach((step, i) => step.classList.toggle('is-active', i === index));
    slides.forEach((slide, i) => {
      slide.classList.toggle('is-active', i === index);
      slide.inert = i !== index;
      slide.setAttribute('aria-hidden', String(i !== index));
    });
  }
  function update() {
    pending = false;
    if (!wide.matches) return;
    // Preserve the slide belonging to a focused link while keyboard navigating.
    const focused = steps.findIndex(step => step.contains(document.activeElement));
    if (focused >= 0) { select(focused); return; }
    const target = innerHeight * 0.5;
    const distances = steps.map(step => {
      const rect = step.getBoundingClientRect();
      return Math.abs(rect.top + rect.height / 2 - target);
    });
    select(distances.indexOf(Math.min(...distances)));
  }
  function schedule() {
    if (!pending) { pending = true; requestAnimationFrame(update); }
  }
  function mode() {
    root!.classList.toggle('is-enhanced', wide.matches);
    stage.setAttribute('aria-hidden', String(!wide.matches));
    steps.forEach(step => {
      const figure = step.querySelector<HTMLElement>('.showcase-inline')!;
      figure.inert = wide.matches;
      figure.setAttribute('aria-hidden', String(wide.matches));
    });
    update();
  }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  root.addEventListener('focusin', schedule);
  root.addEventListener('focusout', schedule);
  wide.addEventListener('change', mode);
  mode();
}
