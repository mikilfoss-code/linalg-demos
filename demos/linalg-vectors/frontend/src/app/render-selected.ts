import { toImageData, type DatasetMeta, type DatasetSample, type ImageSample, type TextSample } from '../lib/dataset';
import { type DatasetModality } from '../lib/types';
import { VECTOR_WINDOW } from './constants';
import { clampOffset } from './state';

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

type SelectedRenderer = {
  renderSelected: (
    sample: DatasetSample | null,
    meta: DatasetMeta | null,
    offset: number,
    sourceLabel: string,
    fallbackModality: DatasetModality | null
  ) => void;
  resetTextSignature: () => void;
};

function parsePixelValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

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

function drawVectorWindowOutline(
  ctx: CanvasRenderingContext2D,
  imageWidth: number,
  imageHeight: number,
  displayWidth: number,
  displayHeight: number,
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

  const cellWidth = displayWidth / imageWidth;
  const cellHeight = displayHeight / imageHeight;
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
    const x = colStart * cellWidth;
    const y = row * cellHeight;
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

function isTextSample(sample: DatasetSample | null): sample is TextSample {
  return sample?.kind === 'text';
}

function isImageSample(sample: DatasetSample | null): sample is ImageSample {
  return sample?.kind === 'image';
}

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

  function renderSelected(
    sample: DatasetSample | null,
    meta: DatasetMeta | null,
    offset: number,
    sourceLabel: string,
    fallbackModality: DatasetModality | null
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
      renderImageCard(isImageSample(sample) ? sample : null, meta, offset, sourceLabel);
    }
  }

  function renderImageCard(
    sample: ImageSample | null,
    meta: DatasetMeta,
    offset: number,
    sourceLabel: string
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
      ctx.drawImage(selectedBuffer, 0, 0, displayWidth, displayHeight);
    } else {
      ctx.putImageData(toImageData(sample, meta.imageWidth, meta.imageHeight), 0, 0);
    }

    drawVectorWindowOutline(
      ctx,
      meta.imageWidth,
      meta.imageHeight,
      displayWidth,
      displayHeight,
      offset,
      VECTOR_WINDOW,
      sample.vector.length,
      getOutlineColor()
    );
    const label = sample.labelName ? sample.labelName : `label ${sample.label}`;
    selectedStatus.textContent = `${sourceLabel} #${sample.index} (${label})`;
  }

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

  function resetTextSignature() {
    lastTextSignature = '';
  }

  return {
    renderSelected,
    resetTextSignature,
  };
}
