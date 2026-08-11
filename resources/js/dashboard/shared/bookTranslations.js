export const translationLocaleOptions = [
    { label: 'English', value: 'en' },
    { label: 'Italian', value: 'it' },
    { label: 'Spanish', value: 'es' },
    { label: 'French', value: 'fr' },
    { label: 'German', value: 'de' },
    { label: 'Portuguese', value: 'pt' },
    { label: 'Polish', value: 'pl' },
    { label: 'Turkish', value: 'tr' },
    { label: 'Russian', value: 'ru' },
    { label: 'Dutch', value: 'nl' },
    { label: 'Czech', value: 'cs' },
    { label: 'Arabic', value: 'ar' },
    { label: 'Chinese', value: 'zh' },
    { label: 'Japanese', value: 'ja' },
    { label: 'Hungarian', value: 'hu' },
    { label: 'Korean', value: 'ko' },
];

export function translationData(payload) {
    if (payload?.data?.data) return payload.data.data;
    if (payload?.data) return payload.data;

    return payload || {};
}

function translationPath(keyBook, blockUuid) {
    return `/dashboard/api/books/${encodeURIComponent(keyBook)}/blocks/${encodeURIComponent(blockUuid)}/translations`;
}

export async function loadBookBlockTranslations(keyBook, blockUuid) {
    return translationData(await _.http.getJSON(translationPath(keyBook, blockUuid)));
}

export async function createAiBookBlockTranslation(keyBook, blockUuid, { targetLocale, providerKey, model }) {
    return translationData(await _.http.postJSON(translationPath(keyBook, blockUuid), {
        target_locale: targetLocale,
        provider_key: providerKey,
        model,
    }));
}

export async function saveManualBookBlockTranslation(keyBook, blockUuid, { targetLocale, translatedText }) {
    return translationData(await _.http.postJSON(translationPath(keyBook, blockUuid), {
        target_locale: targetLocale,
        provider_key: 'manual',
        model: 'manual-v1',
        translated_text: translatedText,
    }));
}

export async function resolveBookBlockTranslation(keyBook, blockUuid, translationId, status) {
    return translationData(await _.http.patchJSON(
        `${translationPath(keyBook, blockUuid)}/${encodeURIComponent(translationId)}`,
        { status },
    ));
}
