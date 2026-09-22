function loadingFrameFor(image: HTMLImageElement): HTMLElement | null {
  const explicitFrame = image.closest<HTMLElement>('[data-image-frame]');
  if (explicitFrame) return explicitFrame;

  if (!image.closest('.docs-prose')) return null;
  const frame = document.createElement('span');
  frame.className = 'image-loading-frame prose-image-frame';
  frame.dataset.imageFrame = '';
  image.replaceWith(frame);
  frame.append(image);
  return frame;
}

function showImageError(frame: HTMLElement) {
  frame.dataset.imageState = 'error';
  if (frame.querySelector('.image-load-error')) return;

  const message = document.createElement('span');
  message.className = 'image-load-error';
  message.setAttribute('role', 'status');
  message.textContent = '图片加载失败';
  frame.append(message);
}

export function initializeImageLoading(root: ParentNode = document) {
  const images = root.querySelectorAll<HTMLImageElement>('[data-image-loading], .docs-prose img');

  images.forEach((image) => {
    const frame = loadingFrameFor(image);
    if (!frame) return;

    const width = Number(image.getAttribute('width'));
    const height = Number(image.getAttribute('height'));
    if (width > 0 && height > 0 && !frame.classList.contains('blog-cover')) {
      frame.style.aspectRatio = `${width} / ${height}`;
      if (frame.classList.contains('prose-image-frame')) frame.style.maxWidth = `${width}px`;
    }

    const loaded = () => {
      frame.dataset.imageState = 'loaded';
      frame.querySelector('.image-load-error')?.remove();
    };
    const failed = () => showImageError(frame);

    image.addEventListener('load', loaded);
    image.addEventListener('error', failed);
    frame.dataset.imageState = 'loading';
    if (image.complete) image.naturalWidth > 0 ? loaded() : failed();
    frame.dataset.imageEnhanced = '';
  });
}
