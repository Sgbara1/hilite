// Hilite — text anchoring engine.
// Highlights are stored as text quotes (exact + prefix + suffix), not DOM paths,
// so they survive page re-renders, class changes, and most layout edits.

const HiliteAnchor = (() => {
  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "TEXTAREA", "INPUT", "SELECT", "SVG"
  ]);

  function isVisibleTextNode(node) {
    const parent = node.parentElement;
    if (!parent) return false;
    if (SKIP_TAGS.has(parent.tagName)) return false;
    if (parent.closest(".hilite-ui")) return false;
    return true;
  }

  // Build a flat index of the page text: full string + per-node offsets.
  function buildIndex(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return isVisibleTextNode(node)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    const offsets = [];
    let text = "";
    let n;
    while ((n = walker.nextNode())) {
      nodes.push(n);
      offsets.push(text.length);
      text += n.nodeValue;
    }
    return { text, nodes, offsets };
  }

  // Locate a stored quote in the index. Prefix/suffix disambiguate repeats.
  function locate(index, quote) {
    const { text } = index;
    const candidates = [];
    let from = 0;
    while (true) {
      const i = text.indexOf(quote.exact, from);
      if (i === -1) break;
      candidates.push(i);
      from = i + 1;
      if (candidates.length > 200) break;
    }
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    let best = candidates[0];
    let bestScore = -1;
    for (const i of candidates) {
      let score = 0;
      if (quote.prefix) {
        const before = text.slice(Math.max(0, i - quote.prefix.length), i);
        score += sharedSuffixLen(before, quote.prefix);
      }
      if (quote.suffix) {
        const after = text.slice(i + quote.exact.length, i + quote.exact.length + quote.suffix.length);
        score += sharedPrefixLen(after, quote.suffix);
      }
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

  function sharedPrefixLen(a, b) {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return i;
  }

  function sharedSuffixLen(a, b) {
    let i = 0;
    while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
    return i;
  }

  // Map a [start, end) range in the flat text back to (node, offset) pairs
  // and wrap each covered slice of each text node in a mark element.
  function wrapRange(index, start, end, makeWrapper) {
    const { nodes, offsets } = index;
    const marks = [];
    for (let i = 0; i < nodes.length; i++) {
      const nodeStart = offsets[i];
      const nodeEnd = nodeStart + nodes[i].nodeValue.length;
      if (nodeEnd <= start) continue;
      if (nodeStart >= end) break;

      const sliceStart = Math.max(start, nodeStart) - nodeStart;
      const sliceEnd = Math.min(end, nodeEnd) - nodeStart;
      if (sliceStart === sliceEnd) continue;

      const node = nodes[i];
      const range = document.createRange();
      range.setStart(node, sliceStart);
      range.setEnd(node, sliceEnd);
      const wrapper = makeWrapper();
      try {
        range.surroundContents(wrapper);
        marks.push(wrapper);
      } catch (e) {
        // Partial-element ranges can throw; skip that slice rather than break the page.
      }
    }
    return marks;
  }

  // Turn the current selection into a stored quote.
  function quoteFromSelection(sel, contextLen = 48) {
    if (!sel || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    const exact = range.toString();
    if (!exact.trim()) return null;

    const index = buildIndex(document.body);
    // Find where the selection sits in the flat text by locating its start node.
    const startInfo = flatOffsetOf(index, range.startContainer, range.startOffset);
    if (startInfo === null) {
      // Fallback: first occurrence of the exact text.
      const i = index.text.indexOf(exact);
      if (i === -1) return null;
      return makeQuote(index.text, i, exact, contextLen);
    }
    // The selection string may normalize whitespace differently than the flat
    // text; search near the computed start for robustness.
    const windowStart = Math.max(0, startInfo - 2);
    const i = index.text.indexOf(exact, windowStart);
    const pos = i !== -1 ? i : index.text.indexOf(exact);
    if (pos === -1) return null;
    return makeQuote(index.text, pos, exact, contextLen);
  }

  function makeQuote(text, pos, exact, contextLen) {
    return {
      exact,
      prefix: text.slice(Math.max(0, pos - contextLen), pos),
      suffix: text.slice(pos + exact.length, pos + exact.length + contextLen)
    };
  }

  function flatOffsetOf(index, container, offset) {
    let node = container;
    let extra = 0;
    if (node.nodeType !== Node.TEXT_NODE) {
      // Element container: use its first text descendant at/after `offset` child.
      const child = node.childNodes[offset] || node;
      const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
      node = walker.nextNode();
      if (!node) return null;
    } else {
      extra = offset;
    }
    const i = index.nodes.indexOf(node);
    if (i === -1) return null;
    return index.offsets[i] + extra;
  }

  // Re-apply a stored highlight. Returns the created mark elements (or []).
  function apply(highlight, makeWrapper) {
    const index = buildIndex(document.body);
    const pos = locate(index, highlight);
    if (pos === null) return [];
    return wrapRange(index, pos, pos + highlight.exact.length, makeWrapper);
  }

  return { buildIndex, locate, wrapRange, quoteFromSelection, apply };
})();
