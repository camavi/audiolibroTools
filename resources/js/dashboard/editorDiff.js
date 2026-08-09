import { DIFF_DELETE, DIFF_EQUAL, DIFF_INSERT, diff_match_patch } from './diff_match_patch';

const differ = new diff_match_patch();
differ.Diff_Timeout = 0.75;

export function buildVersionTextDiff(previousText = '', nextText = '') {
    const previous = String(previousText || '');
    const next = String(nextText || '');
    const diffs = differ.diff_main(previous, next, true);
    differ.diff_cleanupSemantic(diffs);

    return diffs
        .map((diff) => ({
            type: diffOperationType(diff[0]),
            text: diff[1],
        }))
        .filter((part) => part.text.length);
}

export function summarizeVersionTextDiff(parts) {
    return parts.reduce((summary, part) => {
        if (part.type === 'added') {
            summary.added += countWords(part.text);
        }

        if (part.type === 'removed') {
            summary.removed += countWords(part.text);
        }

        return summary;
    }, { added: 0, removed: 0 });
}

function diffOperationType(operation) {
    if (operation === DIFF_INSERT) return 'added';
    if (operation === DIFF_DELETE) return 'removed';
    if (operation === DIFF_EQUAL) return 'same';

    return 'same';
}

function countWords(text) {
    return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}
