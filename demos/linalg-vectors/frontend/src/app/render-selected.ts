import { toImageData, type DatasetMeta, type DatasetSample, type ImageSample, type TextSample } from '../lib/dataset';
import { type DatasetModality } from '../lib/types';
import { VECTOR_WINDOW } from './constants';
import { clampOffset } from './state';

/**
 * Purpose: SelectedRendererDeps object contract.
 * Key fields: Properties declared inside this type definition.
 */
type SelectedRendererDeps = {
  selectedStatus: HTMLDivElement;
  selectedCard: HTMLDivElement;
  selectedCanvas: HTMLCanvasElement;
  selectedText: HTMLDivElement;
  selectedTextContent: HTMLDivElement;
  selectedBuffer: HTMLCanvasElement;
  selectedBufferCtx: CanvasRenderingContext2D | null;
  getOutlineColor: () => string;
  renderSelectedTextContent: (sample: TextSample, meta: DatasetMeta) => void;
};

/**
 * Purpose: SelectedRenderer object contract.
 * Key fields: Properties declared inside this type definition.
 */
type SelectedRenderer = {
  renderSelected: (
    sample: DatasetSample | null,
    meta: DatasetMeta | null,
    offset: number,
    sourceLabel: string,
    fallbackModality: DatasetModality | null,
    highlightedPixelIndex: number | null
  ) => void;
  resetTextSignature: () => void;
};

/**
 * Parse a CSS length string into a finite numeric value.
 *
 * @param value - Raw CSS length string.
 * @returns Parsed number or `0` when parsing fails.
 */
function parsePixelValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Measure drawable canvas content area, excluding CSS padding.
 *
 * @param canvas - Target canvas element.
 * @param fallbackWidth - Width used when DOM measurements are unavailable.
 * @param fallbackHeight - Height used when DOM measurements are unavailable.
 * @returns Canvas content width/height in CSS pixels.
 */
function getCanvasContentSize(
  canvas: HTMLCanvasElement,
  fallbackWidth: number,
  fallbackHeight: number
): { width: number; height: number } {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return { width: fallbackWidth, height: fallbackHeight };
  }
  const styles = getComputedStyle(canvas);
  const paddingX = parsePixelValue(styles.paddingLeft) + parsePixelValue(styles.paddingRight);
  const paddingY = parsePixelValue(styles.paddingTop) + parsePixelValue(styles.paddingBottom);
  return {
    width: Math.max(1, rect.width - paddingX),
    height: Math.max(1, rect.height - paddingY),
  };
}

/**
 * Resize canvas backing store to match CSS display size and pixel ratio.
 *
 * @param canvas - Target canvas element.
 * @param fallbackWidth - Width used when DOM measurements are unavailable.
 * @param fallbackHeight - Height used when DOM measurements are unavailable.
 * @returns Display-space width/height and applied device-pixel-ratio scale.
 */
function syncCanvasToDisplay(
  canvas: HTMLCanvasElement,
  fallbackWidth: number,
  fallbackHeight: number
): { width: number; height: number; scale: number } {
  const contentSize = getCanvasContentSize(canvas, fallbackWidth, fallbackHeight);
  const scale = window.devicePixelRatio || 1;
  const pixelWidth = Math.max(1, Math.round(contentSize.width * scale));
  const pixelHeight = Math.max(1, Math.round(contentSize.height * scale));

  // Match the canvas backing store to its CSS size so 1px strokes stay 1px.
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  return {
    width: canvas.width / scale,
    height: canvas.height / scale,
    scale,
  };
}

/**
 * Compute a contain-fit rectangle for drawing an image inside a canvas area.
 *
 * @param containerWidth - Available draw width in CSS pixels.
 * @param containerHeight - Available draw height in CSS pixels.
 * @param imageWidth - Source image width in pixels.
 * @param imageHeight - Source image height in pixels.
 * @returns Rect where the image should be drawn to preserve aspect ratio.
 */
function getContainedImageRect(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number
): { x: number; y: number; width: number; height: number } {
  if (
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    imageWidth <= 0 ||
    imageHeight <= 0
  ) {
    return { x: 0, y: 0, width: Math.max(1, containerWidth), height: Math.max(1, containerHeight) };
  }

  const containerRatio = containerWidth / containerHeight;
  const imageRatio = imageWidth / imageHeight;
  if (imageRatio >= containerRatio) {
    const width = containerWidth;
    const height = width / imageRatio;
    return {
      x: 0,
      y: (containerHeight - height) / 2,
      width,
      height,
    };
  }

  const height = containerHeight;
  const width = height * imageRatio;
  return {
    x: (containerWidth - width) / 2,
    y: 0,
    width,
    height,
  };
}

/**
 * Draw an outline showing the currently visible vector window on the image.
 *
 * @param ctx - 2D rendering context.
 * @param imageWidth - Source image width in pixels.
 * @param imageHeight - Source image height in pixels.
 * @param imageRect - Draw rectangle where the image is rendered in the canvas.
 * @param offset - Requested vector window offset.
 * @param windowSize - Number of vector components shown in the window.
 * @param vectorLength - Total vector length.
 * @param outlineColor - Stroke color used for the window outline.
 * @returns Nothing. Draws directly on the provided context.
 */
function drawVectorWindowOutline(
  ctx: CanvasRenderingContext2D,
  imageWidth: number,
  imageHeight: number,
  imageRect: { x: number; y: number; width: number; height: number },
  offset: number,
  windowSize: number,
  vectorLength: number,
  outlineColor: string
) {
  // The window is a linear slice, so it can span row boundaries.
  const start = clampOffset(offset, vectorLength);
  const endExclusive = Math.min(vectorLength, start + windowSize);
  if (endExclusive <= start) return;

  ctx.save();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 1;
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'square';

  const cellWidth = imageRect.width / imageWidth;
  const cellHeight = imageRect.height / imageHeight;
  if (
    !Number.isFinite(cellWidth) ||
    !Number.isFinite(cellHeight) ||
    cellWidth <= 0 ||
    cellHeight <= 0
  ) {
    ctx.restore();
    return;
  }

  const startRow = Math.floor(start / imageWidth);
  const startCol = start % imageWidth;
  const endIndex = endExclusive - 1;
  const endRow = Math.floor(endIndex / imageWidth);
  const endCol = endIndex % imageWidth;

  const drawRowOutline = (row: number, colStart: number, colEnd: number) => {
    if (colEnd < colStart) return;
    const width = (colEnd - colStart + 1) * cellWidth;
    const height = cellHeight;
    const x = imageRect.x + colStart * cellWidth;
    const y = imageRect.y + row * cellHeight;
    // Keep the 1px stroke inside the row bounds for a crisp outline.
    ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, width - 1), Math.max(0, height - 1));
  };

  if (startRow === endRow) {
    drawRowOutline(startRow, startCol, endCol);
  } else {
    drawRowOutline(startRow, startCol, imageWidth - 1);
    for (let row = startRow + 1; row < endRow; row += 1) {
      drawRowOutline(row, 0, imageWidth - 1);
    }
    drawRowOutline(endRow, 0, endCol);
  }

  ctx.restore();
}

/**
 * Draw translucent highlight for a single active pixel in image mode.
 *
 * @param ctx - 2D rendering context.
 * @param imageWidth - Source image width in pixels.
 * @param imageHeight - Source image height in pixels.
 * @param imageRect - Draw rectangle where the image is rendered in the canvas.
 * @param highlightedPixelIndex - Active pixel index, or `null` for none.
 * @param vectorLength - Total vector length.
 * @returns Nothing. Draws directly on the provided context.
 */
function drawPixelHighlight(
  ctx: CanvasRenderingContext2D,
  imageWidth: number,
  imageHeight: number,
  imageRect: { x: number; y: number; width: number; height: number },
  highlightedPixelIndex: number | null,
  vectorLength: number
) {
  if (highlightedPixelIndex === null) return;
  if (highlightedPixelIndex < 0 || highlightedPixelIndex >= vectorLength) return;

  const cellWidth = imageRect.width / imageWidth;
  const cellHeight = imageRect.height / imageHeight;
  if (
    !Number.isFinite(cellWidth) ||
    !Number.isFinite(cellHeight) ||
    cellWidth <= 0 ||
    cellHeight <= 0
  ) {
    return;
  }

  const row = Math.floor(highlightedPixelIndex / imageWidth);
  const col = highlightedPixelIndex % imageWidth;

  ctx.save();
  ctx.fillStyle = 'rgba(240, 100, 73, 0.35)';
  ctx.fillRect(
    imageRect.x + col * cellWidth,
    imageRect.y + row * cellHeight,
    cellWidth,
    cellHeight
  );
  ctx.restore();
}

/**
 * Type guard for text samples.
 *
 * @param sample - Candidate dataset sample.
 * @returns `true` when sample is a text sample.
 */
function isTextSample(sample: DatasetSample | null): sample is TextSample {
  return sample?.kind === 'text';
}

/**
 * Type guard for image samples.
 *
 * @param sample - Candidate dataset sample.
 * @returns `true` when sample is an image sample.
 */
function isImageSample(sample: DatasetSample | null): sample is ImageSample {
  return sample?.kind === 'image';
}

/**
 * Create renderer for the selected-card panel in both image and text modes.
 *
 * @param selectedStatus - Status element that shows selected item metadata.
 * @param selectedCard - Selected-card root element.
 * @param selectedCanvas - Canvas used for image previews.
 * @param selectedText - Wrapper used for text-mode content.
 * @param selectedTextContent - Scrollable text content container.
 * @param selectedBuffer - Offscreen buffer canvas for image blitting.
 * @param selectedBufferCtx - Offscreen buffer context.
 * @param getOutlineColor - Function returning the active outline color token.
 * @param renderSelectedTextContent - Function that tokenizes/renders selected text.
 * @returns Renderer with `renderSelected(...)` and `resetTextSignature()`.
 */
export function createSelectedRenderer({
  selectedStatus,
  selectedCard,
  selectedCanvas,
  selectedText,
  selectedTextContent,
  selectedBuffer,
  selectedBufferCtx,
  getOutlineColor,
  renderSelectedTextContent,
}: SelectedRendererDeps): SelectedRenderer {
  let lastTextSignature = '';

  /**
   * Render selected-card content for the active dataset modality.
   *
   * @param sample - Selected sample or `null` when there is no selection.
   * @param meta - Dataset metadata used to resolve modality.
   * @param offset - Vector window offset for image overlay rendering.
   * @param sourceLabel - Dataset label shown in selected status text.
   * @param fallbackModality - Catalog modality used when metadata is not loaded.
   * @param highlightedPixelIndex - Active pixel index to overlay, or `null`.
   * @returns Nothing. Mutates selected-card DOM state.
   */
  function renderSelected(
    sample: DatasetSample | null,
    meta: DatasetMeta | null,
    offset: number,
    sourceLabel: string,
    fallbackModality: DatasetModality | null,
    highlightedPixelIndex: number | null
  ) {
    if (!meta) {
      selectedStatus.textContent = 'No selection';
      if (fallbackModality === 'text') {
        selectedCard.classList.add('is-text-mode');
        selectedCanvas.hidden = true;
        selectedText.hidden = false;
        selectedTextContent.textContent = 'Select a document to view its text.';
      } else {
        selectedCard.classList.remove('is-text-mode');
        selectedCanvas.hidden = false;
        selectedText.hidden = true;
        selectedTextContent.textContent = '';
      }
      return;
    }

    if (meta.modality === 'text') {
      renderTextCard(isTextSample(sample) ? sample : null, meta, sourceLabel);
    } else {
      renderImageCard(
        isImageSample(sample) ? sample : null,
        meta,
        offset,
        sourceLabel,
        highlightedPixelIndex
      );
    }
  }

  /**
   * Render image-mode selected card and vector-window overlays.
   *
   * @param sample - Selected image sample or `null`.
   * @param meta - Image dataset metadata.
   * @param offset - Vector window offset.
   * @param sourceLabel - Dataset label shown in selected status text.
   * @param highlightedPixelIndex - Active pixel index to overlay, or `null`.
   * @returns Nothing. Draws into selected canvas and updates status text.
   */
  function renderImageCard(
    sample: ImageSample | null,
    meta: DatasetMeta,
    offset: number,
    sourceLabel: string,
    highlightedPixelIndex: number | null
  ) {
    selectedCard.classList.remove('is-text-mode');
    selectedCanvas.hidden = false;
    selectedText.hidden = true;
    const ctx = selectedCanvas.getContext('2d');
    if (!ctx) return;
    selectedCanvas.style.setProperty('--selected-canvas-aspect', `${meta.imageWidth} / ${meta.imageHeight}`);
    const { width: displayWidth, height: displayHeight, scale } = syncCanvasToDisplay(
      selectedCanvas,
      meta.imageWidth,
      meta.imageHeight
    );
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, displayWidth, displayHeight);
    const imageRect = getContainedImageRect(
      displayWidth,
      displayHeight,
      meta.imageWidth,
      meta.imageHeight
    );

    if (!sample) {
      selectedStatus.textContent = 'No selection';
      return;
    }

    if (selectedBufferCtx) {
      if (selectedBuffer.width !== meta.imageWidth || selectedBuffer.height !== meta.imageHeight) {
        selectedBuffer.width = meta.imageWidth;
        selectedBuffer.height = meta.imageHeight;
      }
      selectedBufferCtx.putImageData(toImageData(sample, meta.imageWidth, meta.imageHeight), 0, 0);
      ctx.drawImage(
        selectedBuffer,
        imageRect.x,
        imageRect.y,
        imageRect.width,
        imageRect.height
      );
    } else {
      ctx.putImageData(
        toImageData(sample, meta.imageWidth, meta.imageHeight),
        Math.round(imageRect.x),
        Math.round(imageRect.y)
      );
    }

    drawPixelHighlight(
      ctx,
      meta.imageWidth,
      meta.imageHeight,
      imageRect,
      highlightedPixelIndex,
      sample.vector.length
    );

    drawVectorWindowOutline(
      ctx,
      meta.imageWidth,
      meta.imageHeight,
      imageRect,
      offset,
      VECTOR_WINDOW,
      sample.vector.length,
      getOutlineColor()
    );
    const label = sample.labelName ? sample.labelName : `label ${sample.label}`;
    selectedStatus.textContent = `${sourceLabel} #${sample.index} (${label})`;
  }

  /**
   * Render text-mode selected card content.
   *
   * @param sample - Selected text sample or `null`.
   * @param meta - Text dataset metadata.
   * @param sourceLabel - Dataset label shown in selected status text.
   * @returns Nothing. Updates selected text container and status text.
   */
  function renderTextCard(sample: TextSample | null, meta: DatasetMeta, sourceLabel: string) {
    selectedCard.classList.add('is-text-mode');
    selectedCanvas.hidden = true;
    selectedText.hidden = false;

    if (!sample) {
      selectedStatus.textContent = 'No selection';
      selectedTextContent.textContent = 'Select a document to view its text.';
      return;
    }

    const label = sample.labelName ? sample.labelName : `label ${sample.label}`;
    selectedStatus.textContent = `${sourceLabel} #${sample.index} (${label})`;

    const signature = `${meta.source}:${sample.index}`;
    if (signature !== lastTextSignature) {
      renderSelectedTextContent(sample, meta);
      lastTextSignature = signature;
    }
  }

  /**
   * Clear memoized text signature so text content can be force-rendered again.
   *
   * @returns Nothing.
   */
  function resetTextSignature() {
    lastTextSignature = '';
  }

  return {
    renderSelected,
    resetTextSignature,
  };
}
