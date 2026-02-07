import { type DatasetMeta, type TextSample } from '../lib/dataset';

const WORD_REGEX = /\b[a-zA-Z]{2,}\b/g;
const EMAIL_REGEX = /\b[\w.%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

type TextHighlightingDeps = {
  vectorList: HTMLDivElement;
  vectorPanel: HTMLDivElement;
  selectedTextContent: HTMLDivElement;
};

export type TextHighlightingController = {
  clearTextHighlight: () => void;
  clearVectorHighlight: () => void;
  setVectorHighlight: (word: string | null, weight: number) => void;
  setTextHighlight: (word: string | null, weight: number) => void;
  updateVectorTextWordWidth: (meta: DatasetMeta | null) => void;
  renderSelectedTextContent: (sample: TextSample, meta: DatasetMeta) => void;
  resetTextModeState: () => void;
  getWordWeight: (word: string) => number;
  getFirstTextSpan: (word: string) => HTMLSpanElement | null;
  getActiveHighlightedWord: () => string | null;
};

function getEmailRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  EMAIL_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = EMAIL_REGEX.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

function isInsideRanges(index: number, ranges: Array<{ start: number; end: number }>): boolean {
  for (const range of ranges) {
    if (index >= range.start && index < range.end) {
      return true;
    }
  }
  return false;
}

export function createTextHighlightingController({
  vectorList,
  vectorPanel,
  selectedTextContent,
}: TextHighlightingDeps): TextHighlightingController {
  let activeTextWordSpans = new Map<string, HTMLSpanElement[]>();
  let activeTextWordWeights = new Map<string, number>();
  let activeHighlightedWord: string | null = null;
  let vocabIndexMap: Map<string, number> | null = null;
  let vocabSignature = '';
  let textWordWidthSignature = '';

  function ensureVocabIndexMap(meta: DatasetMeta | null): Map<string, number> | null {
    const vocab = meta?.vocab ?? null;
    if (!vocab || vocab.length === 0) {
      vocabIndexMap = null;
      vocabSignature = '';
      return null;
    }
    const signature = `${meta?.source ?? 'unknown'}:${vocab.length}`;
    if (signature !== vocabSignature || !vocabIndexMap) {
      const nextMap = new Map<string, number>();
      vocab.forEach((word, index) => {
        nextMap.set(word, index);
      });
      vocabIndexMap = nextMap;
      vocabSignature = signature;
    }
    return vocabIndexMap;
  }

  function clearTextHighlight() {
    if (!activeHighlightedWord) return;
    const spans = activeTextWordSpans.get(activeHighlightedWord);
    spans?.forEach((span) => {
      span.classList.remove('is-highlighted');
      span.style.removeProperty('--word-highlight-alpha');
    });
    activeHighlightedWord = null;
  }

  function clearVectorHighlight() {
    const rows = vectorList.querySelectorAll<HTMLElement>('.vector-row.is-text.is-highlighted');
    rows.forEach((row) => {
      row.classList.remove('is-highlighted');
      row.style.removeProperty('--vector-word-highlight-alpha');
    });
  }

  function setVectorHighlight(word: string | null, weight: number) {
    clearVectorHighlight();
    if (!word || weight <= 0) return;

    const rows = vectorList.querySelectorAll<HTMLElement>('.vector-row.is-text');
    rows.forEach((row) => {
      const rowWord = row.dataset.word;
      const count = Number(row.dataset.count) || 0;
      if (rowWord === word && count > 0) {
        row.classList.add('is-highlighted');
        row.style.setProperty('--vector-word-highlight-alpha', String(weight));
      }
    });
  }

  function setTextHighlight(word: string | null, weight: number) {
    if (!word || weight <= 0) {
      clearTextHighlight();
      clearVectorHighlight();
      return;
    }
    clearTextHighlight();
    clearVectorHighlight();
    setVectorHighlight(word, weight);
    const spans = activeTextWordSpans.get(word);
    if (spans && spans.length > 0) {
      spans.forEach((span) => {
        span.classList.add('is-highlighted');
        span.style.setProperty('--word-highlight-alpha', String(weight));
      });
    }
    activeHighlightedWord = word;
  }

  function updateVectorTextWordWidth(meta: DatasetMeta | null) {
    if (!meta || meta.modality !== 'text' || !meta.vocab || meta.vocab.length === 0) {
      vectorPanel.style.removeProperty('--vector-text-word-width-dynamic');
      textWordWidthSignature = '';
      return;
    }

    const signature = `${meta.source}:${meta.vectorLength}:${meta.vocab.length}`;
    if (signature === textWordWidthSignature) {
      return;
    }

    const longestWordLength = meta.vocab.reduce((longest, word) => Math.max(longest, word.length), 2);
    vectorPanel.style.setProperty('--vector-text-word-width-dynamic', `${longestWordLength}ch`);
    textWordWidthSignature = signature;
  }

  function renderSelectedTextContent(sample: TextSample, meta: DatasetMeta) {
    clearTextHighlight();
    activeTextWordSpans = new Map<string, HTMLSpanElement[]>();
    activeTextWordWeights = new Map<string, number>();
    selectedTextContent.textContent = '';
    selectedTextContent.scrollTop = 0;

    const vocabMap = ensureVocabIndexMap(meta);
    if (!vocabMap) {
      selectedTextContent.textContent = sample.rawText;
      return;
    }

    const fragment = document.createDocumentFragment();
    const text = sample.rawText;
    const emailRanges = getEmailRanges(text);
    sample.wordCounts.forEach((entry) => {
      const word = meta.vocab?.[entry.index];
      if (word) {
        activeTextWordWeights.set(word, entry.weight);
      }
    });
    WORD_REGEX.lastIndex = 0;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WORD_REGEX.exec(text)) !== null) {
      const start = match.index;
      const word = match[0];
      const end = start + word.length;
      if (start > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, start)));
      }
      if (isInsideRanges(start, emailRanges)) {
        fragment.appendChild(document.createTextNode(word));
        lastIndex = end;
        continue;
      }

      const normalized = word.toLowerCase();
      const vocabIndex = vocabMap.get(normalized);
      if (vocabIndex !== undefined) {
        const span = document.createElement('span');
        span.className = 'text-word';
        span.textContent = word;
        span.dataset.word = normalized;
        span.dataset.index = String(vocabIndex);
        const entries = activeTextWordSpans.get(normalized);
        if (entries) {
          entries.push(span);
        } else {
          activeTextWordSpans.set(normalized, [span]);
        }
        fragment.appendChild(span);
      } else {
        fragment.appendChild(document.createTextNode(word));
      }
      lastIndex = end;
    }
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
    selectedTextContent.appendChild(fragment);
  }

  function resetTextModeState() {
    clearTextHighlight();
    clearVectorHighlight();
    activeTextWordSpans = new Map<string, HTMLSpanElement[]>();
    activeTextWordWeights = new Map<string, number>();
    vocabIndexMap = null;
    vocabSignature = '';
  }

  function getWordWeight(word: string): number {
    return activeTextWordWeights.get(word) ?? 0;
  }

  function getFirstTextSpan(word: string): HTMLSpanElement | null {
    const spans = activeTextWordSpans.get(word);
    return spans?.[0] ?? null;
  }

  function getActiveHighlightedWord(): string | null {
    return activeHighlightedWord;
  }

  return {
    clearTextHighlight,
    clearVectorHighlight,
    setVectorHighlight,
    setTextHighlight,
    updateVectorTextWordWidth,
    renderSelectedTextContent,
    resetTextModeState,
    getWordWeight,
    getFirstTextSpan,
    getActiveHighlightedWord,
  };
}
