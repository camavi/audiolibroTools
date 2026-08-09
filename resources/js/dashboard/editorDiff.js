import { DIFF_DELETE, DIFF_EQUAL, DIFF_INSERT, diff_match_patch } from './diff_match_patch';

const differ = new diff_match_patch();
differ.Diff_Timeout = 0.75;

const anchorMatcher = new diff_match_patch();
anchorMatcher.Match_Threshold = 0.35;
anchorMatcher.Match_Distance = 1000;

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

export function findApproximateTextMatch(text = '', pattern = '', expectedIndex = 0) {
    const haystack = String(text || '');
    const needle = String(pattern || '').replace(/\s+/g, ' ').trim();
    if (!haystack || !needle) return null;

    const targetIndex = Number(expectedIndex || 0);
    let exactIndex = haystack.indexOf(needle);
    if (exactIndex >= 0) {
        let nextIndex = haystack.indexOf(needle, exactIndex + 1);

        while (nextIndex >= 0) {
            if (Math.abs(nextIndex - targetIndex) < Math.abs(exactIndex - targetIndex)) {
                exactIndex = nextIndex;
            }

            nextIndex = haystack.indexOf(needle, nextIndex + 1);
        }

        return {
            start: exactIndex,
            end: exactIndex + needle.length,
            method: 'exact',
        };
    }

    const matchPattern = needle.slice(0, anchorMatcher.Match_MaxBits);
    const matchIndex = anchorMatcher.match_main(haystack, matchPattern, targetIndex);
    if (matchIndex < 0) return null;

    return {
        start: matchIndex,
        end: Math.min(haystack.length, matchIndex + needle.length),
        method: 'fuzzy',
    };
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
