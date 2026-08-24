import '../../../css/bookTraslate.css';
import {
    createAiBookBlockTranslation,
    loadBookBlockTranslations,
    resolveBookBlockTranslation,
    saveManualBookBlockTranslation,
    translationData,
    translationLocaleOptions,
} from '../shared/bookTranslations';
import { bookPanelButton } from '../shared/bookPanelButton';

const translationBook = _.rod(null);
const translationBlocks = _.rod([]);
const activeBlockIndex = _.rod(0);
const targetLocale = _.rod('en');
const translations = _.rod([]);
const translationDraft = _.rod('');
const pageStatus = _.rod('idle');
const pageError = _.rod(null);
const translationsStatus = _.rod('idle');
const actionStatus = _.rod('idle');
const aiSetting = _.rod({ provider_key: 'mock', model: 'mock-translation-v1' });
const feedback = _.rod(null);
const glossaryTerms = _.rod([]);
const glossaryStatus = _.rod('idle');
const glossarySourceTerm = _.rod('');
const glossaryTargetTerm = _.rod('');
const glossaryNotes = _.rod('');
const savingGlossaryTerm = _.rod(false);
const batchStatus = _.rod('idle');
const approveAllRunning = _.rod(false);
const batchProgress = _.rod({ completed: 0, total: 0, failed: 0 });
const aiProviders = _.rod([]);
const aiProviderKey = _.rod('mock');
const aiProviderModel = _.rod('mock-translation-v1');
const aiProviderApiKey = _.rod('');
const loadingAiProviderModels = _.rod(false);
const aiSystemPrompt = _.rod('');
const savingAiSetting = _.rod(false);
const aiSettingStatus = _.rod(null);
const translationProgress = _.rod({ counts: { all: 0, missing: 0, draft: 0, approved: 0, rejected: 0 }, states: {} });
const reviewOnly = _.rod(false);
const managedTranslationJob = _.rod(null);
const managedJobStatus = _.rod('idle');
const creditBalance = _.rod({ available_credits: 0, reserved_credits: 0, consumed_credits: 0 });
let managedJobPollTimer = null;

function bookKey(ctx) {
    return ctx?.params?.key_book
        || window.location.pathname.match(/\/dashboard\/book\/([^/]+)\/translate/)?.[1]
        || null;
}

function selectValue(value, fallback) {
    return value?.value ?? value ?? fallback;
}

function activeBlock() {
    return translationBlocks.value[activeBlockIndex.value] || null;
}

function blockTranslationStatus(block) {
    return translationProgress.value.states?.[block?.block_uuid] || 'missing';
}

function blocksNeedingReview() {
    const counts = translationProgress.value.counts || {};

    return Number(counts.missing || 0) + Number(counts.draft || 0) + Number(counts.rejected || 0);
}

function countWords(text) {
    const trimmed = String(text || '').trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
}

function localeLabel(locale) {
    return translationLocaleOptions.find((option) => option.value === locale)?.label || String(locale || '').toUpperCase();
}

function currentTranslation() {
    const block = activeBlock();
    if (!block) return null;

    return translations.value.find((translation) => translation.target_locale === targetLocale.value
        && translation.is_current_version
        && translation.status === 'draft')
        || translations.value.find((translation) => translation.target_locale === targetLocale.value
            && translation.is_current_version)
        || null;
}

function setFeedback(message, type = 'success') {
    feedback.value = { message, type };
}

function sourceLanguage() {
    return localeLabel(translationBook.value?.lang || 'original');
}

function selectBlock(index, keyBook) {
    activeBlockIndex.value = index;
    feedback.value = null;
    loadTranslations(keyBook);
}

function moveBlock(direction, keyBook) {
    const nextIndex = activeBlockIndex.value + direction;
    if (nextIndex < 0 || nextIndex >= translationBlocks.value.length) return;
    selectBlock(nextIndex, keyBook);
}

function sourcePane(block, keyBook) {
    return _.section({ class: 'at-translatePane at-translatePane--source' },
        _.div({ class: 'at-translatePaneHeader' },
            _.div(
                _.span({ class: 'at-translatePaneEyebrow' }, 'Original'),
                _.strong(sourceLanguage()),
            ),
            _.span({ class: 'at-translateCount' }, `${countWords(block.text_plain)} words`),
        ),
        _.div({ class: 'at-translateSourceText' }, block.text_plain || 'This block has no text yet.'),
        _.div({ class: 'at-translatePaneFooter at-translatePaneFooter--source' },
            _.button({
                type: 'button',
                class: 'at-translateTextButton',
                onclick: () => copySource(block.text_plain),
            }, _.Icon ? _.Icon({ name: 'content_copy' }) : null, 'Copy original'),
        ),
    );
}

function targetPane(block, keyBook) {
    const translation = currentTranslation();
    const isBusy = actionStatus.value !== 'idle' || batchStatus.value === 'translating';
    const isDraft = translation?.status === 'draft';

    return _.section({ class: 'at-translatePane at-translatePane--target' },
        _.div({ class: 'at-translatePaneHeader' },
            _.div(
                _.span({ class: 'at-translatePaneEyebrow' }, 'Translation'),
                _.strong(() => localeLabel(targetLocale.value)),
            ),
            _.span({ class: () => `at-translateStatus status-${translation?.status || 'new'}` }, () => translation?.status || 'new draft'),
        ),
        _.Textarea({
            class: 'at-translateTextarea',
            label: false,
            rows: 14,
            placeholder: 'Write the translation here, or create an AI draft and refine it.',
            model: translationDraft,
            disabled: () => actionStatus.value === 'generating' || actionStatus.value === 'loading',
        }),
        _.div({ class: 'at-translatePaneFooter at-translatePaneFooter--actions' },
            _.span(() => `${countWords(translationDraft.value)} words`),
            _.div({ class: 'at-translateActions' },
                _.Btn({
                    color: 'secondary',
                    disabled: () => isBusy || !translationDraft.value.trim(),
                    loading: () => actionStatus.value === 'saving',
                    onClick: () => saveManualDraft(keyBook),
                }, 'Save draft'),
                _.Btn({
                    color: 'primary',
                    disabled: () => isBusy || !block.current_version_id,
                    loading: () => actionStatus.value === 'generating',
                    onClick: () => generateAiDraft(keyBook),
                }, 'Translate with AI'),
                isDraft ? _.Btn({
                    color: 'primary',
                    outline: true,
                    disabled: () => isBusy,
                    loading: () => actionStatus.value === 'approving',
                    onClick: () => resolveTranslation(keyBook, 'approved'),
                }, 'Approve') : null,
            ),
        ),
    );
}

function blockNavigator(keyBook) {
    const blocks = translationBlocks.value
        .map((block, index) => ({ block, index }))
        .filter(({ block }) => !reviewOnly.value || blockTranslationStatus(block) !== 'approved');

    return _.aside({ class: 'at-translateNavigator', 'aria-label': 'Book blocks' },
        _.div({ class: 'at-translateNavigatorHead' },
            _.strong('Manuscript'),
            _.span(() => reviewOnly.value ? `${blocksNeedingReview()} to review` : `${translationBlocks.value.length} blocks`),
        ),
        _.div({ class: 'at-translateBlockList' }, () => blocks.map(({ block, index }) => _.button({
            type: 'button',
            class: () => index === activeBlockIndex.value ? 'at-translateBlock is-active' : 'at-translateBlock',
            onclick: () => selectBlock(index, keyBook),
        },
            _.span(String(index + 1)),
            _.strong(block.type === 'heading' ? 'Heading' : 'Text', _.span({ class: () => `at-translateBlockStatus status-${blockTranslationStatus(block)}` }, () => blockTranslationStatus(block))),
            _.small(block.text_plain || 'Empty block'),
        ))),
    );
}

function translationLanguageControls(keyBook) {
    return _.div({ class: 'at-translateLanguageControls' },
        _.span({ class: 'at-translateOriginalLanguage' }, sourceLanguage()),
        _.Icon ? _.Icon({ name: 'arrow_forward' }) : '→',
        _.Select({
            label: false,
            model: targetLocale,
            options: translationLocaleOptions,
            onChange: (value) => {
                targetLocale.value = selectValue(value, targetLocale.value);
                loadTranslations(keyBook);
                loadGlossaryTerms(keyBook);
                loadTranslationProgress(keyBook);
                loadManagedTranslationJob(keyBook);
            },
        }),
    );
}

function translationTopbar(keyBook) {
    return _.div({ class: 'at-translateTopbar' },
        _.div({ class: 'at-translateTopbarTitle' },
            _.Icon ? _.Icon({ name: 'translate' }) : null,
            _.span(translationBook.value?.name || 'Translation'),
        ),
        translationLanguageControls(keyBook),
        _.div({ class: 'at-translateToolbarActions' },
            _.Btn({ color: 'secondary', onClick: () => openAiSettingsDialog(keyBook) }, 'AI settings'),
            _.Btn({
                color: 'primary',
                outline: true,
                loading: () => batchStatus.value === 'translating' || managedJobStatus.value === 'starting',
                disabled: () => batchStatus.value === 'translating' || managedJobStatus.value === 'starting' || managedJobIsActive() || !translationBlocks.value.length,
                onClick: () => usesManagedTranslationBatch() ? openManagedBatchDialog(keyBook) : translateAllBlocks(keyBook),
            }, () => managedJobIsActive()
                ? `Batch ${managedTranslationJob.value.completed_blocks}/${managedTranslationJob.value.total_blocks}`
                : usesManagedTranslationBatch()
                    ? 'Start background batch'
                    : batchStatus.value === 'translating'
                        ? `Translating ${batchProgress.value.completed}/${batchProgress.value.total}`
                        : 'Translate all'),
            _.Btn({
                color: 'primary',
                outline: true,
                loading: approveAllRunning,
                disabled: () => approveAllRunning.value || !Number(translationProgress.value.counts?.draft || 0) && !Number(translationProgress.value.counts?.rejected || 0),
                onClick: () => openApproveAllDialog(keyBook),
            }, 'Approve all'),
            _.Btn({ color: 'secondary', onClick: () => openGlossaryDialog(keyBook) }, 'Glossary'),
        ),
    );
}

function translationBottomBar(keyBook) {
    const block = activeBlock();
    const currentStatus = blockTranslationStatus(block);
    const totalBlocks = translationProgress.value.counts?.all || translationBlocks.value.length;

    return _.div({ class: 'at-translateBottomBar' },
        _.div({ class: 'at-translateBottomContext' },
            _.span({ class: 'at-translateAiProvider' }, () => `AI: ${aiProviderName(aiSetting.value.provider_key)} · ${aiSetting.value.model}`),
            _.span({ class: 'at-translateBottomDivider' }),
            _.span({ class: 'at-translateProgress' }, () => `${translationProgress.value.counts?.approved || 0}/${totalBlocks} approved`),
            _.span({ class: 'at-translateCredits' }, () => `${creditBalance.value.available_credits} credits`),
            () => managedTranslationJob.value ? _.span({ class: () => `at-translateJobStatus status-${managedTranslationJob.value.status}` }, () => `Batch ${managedTranslationJob.value.completed_blocks}/${managedTranslationJob.value.total_blocks}`) : null,
            _.span({ class: () => `at-translateStatus status-${currentStatus}` }, () => currentStatus),
            _.Btn({
                color: 'secondary',
                outline: () => !reviewOnly.value,
                onClick: () => { reviewOnly.value = !reviewOnly.value; },
            }, () => reviewOnly.value ? 'Show all' : `Review ${blocksNeedingReview()}`),
            () => managedJobIsActive() ? _.Btn({ color: 'secondary', outline: true, onClick: () => cancelManagedTranslationJob(keyBook) }, 'Cancel batch') : null,
            () => managedTranslationJob.value?.status === 'completed_with_errors' ? _.Btn({ color: 'secondary', outline: true, onClick: () => openManagedBatchDialog(keyBook) }, 'Retry failed') : null,
        ),
        _.div({ class: 'at-translateBottomFeedback' }, () => feedback.value
            ? _.span({ class: () => `at-translateFeedback is-${feedback.value.type}` }, feedback.value.message)
            : _.span(`Block ${activeBlockIndex.value + 1} of ${translationBlocks.value.length}`),
        ),
        _.div({ class: 'at-translateNavigation' },
            _.Btn({ color: 'secondary', disabled: () => activeBlockIndex.value === 0, onClick: () => moveBlock(-1, keyBook) }, 'Previous block'),
            _.Btn({ color: 'secondary', disabled: () => activeBlockIndex.value >= translationBlocks.value.length - 1, onClick: () => moveBlock(1, keyBook) }, 'Next block'),
        ),
    );
}

function workspace(keyBook) {
    const block = activeBlock();
    if (!block) return _.div({ class: 'at-translateEmpty' }, 'Add text in the editor before starting a translation.');

    return _.div({ class: 'at-translateWorkspace' },
        blockNavigator(keyBook),
        _.div({ class: 'at-translateEditor' },
            () => translationsStatus.value === 'loading'
                ? _.div({ class: 'at-translateLoading' }, 'Loading translation drafts…')
                : null,
            _.div({ class: 'at-translateColumns' },
                () => sourcePane(activeBlock(), keyBook),
                () => targetPane(activeBlock(), keyBook),
            ),
            () => translationBottomBar(keyBook),
        ),
    );
}

function pageContent(keyBook) {
    if (pageStatus.value === 'loading' || pageStatus.value === 'idle') {
        return _.div({ class: 'at-translateEmpty' }, 'Loading translation workspace…');
    }

    if (pageStatus.value === 'error') {
        return _.div({ class: 'at-translateEmpty at-translateEmpty--error' },
            _.span(pageError.value || 'Unable to load this book.'),
            _.Btn({ color: 'secondary', onClick: () => loadWorkspace(keyBook) }, 'Try again'),
        );
    }

    return _.main({ class: 'at-translatePage' },
        translationTopbar(keyBook),
        () => workspace(keyBook),
    );
}

async function loadAiSetting(keyBook) {
    try {
        const payload = translationData(await _.http.getJSON(`/dashboard/api/ai/providers?service=translate&key_book=${encodeURIComponent(keyBook)}`));
        aiSetting.value = payload.setting || aiSetting.value;
        aiProviders.value = payload.providers || [];
        aiProviderKey.value = aiSetting.value.provider_key || 'mock';
        aiProviderModel.value = aiSetting.value.model || 'mock-translation-v1';
        aiSystemPrompt.value = aiSetting.value.system_prompt || '';
        loadLmStudioModels();
    } catch {
        // The translation endpoint has a safe mock fallback when provider settings are unavailable.
    }
}

function selectedAiProvider() {
    return aiProviders.value.find((provider) => provider.provider_key === aiProviderKey.value) || null;
}

function providerNeedsApiKey(providerKey) {
    return providerKey && !['mock', 'ollama', 'lm-studio'].includes(providerKey);
}

async function loadLmStudioModels() {
    if (aiProviderKey.value !== 'lm-studio' || loadingAiProviderModels.value) return;

    loadingAiProviderModels.value = true;
    try {
        const payload = translationData(await _.http.getJSON('/dashboard/api/ai/providers/lm-studio/models'));
        const models = payload.models || [];
        if (!models.length) {
            aiSettingStatus.value = {
                type: 'warning',
                title: 'No language model found',
                message: 'Load an LLM in LM Studio, then try again.',
            };
            return;
        }

        aiProviders.value = aiProviders.value.map((provider) => provider.provider_key === 'lm-studio'
            ? { ...provider, models, default_model: models[0] }
            : provider);

        if (!models.includes(aiProviderModel.value)) {
            aiProviderModel.value = models[0];
        }
    } catch (error) {
        aiSettingStatus.value = {
            type: 'warning',
            title: 'LM Studio unavailable',
            message: error.message || 'Start the LM Studio local server, then try again.',
        };
    } finally {
        loadingAiProviderModels.value = false;
    }
}

function aiProviderName(providerKey) {
    return aiProviders.value.find((provider) => provider.provider_key === providerKey)?.name || providerKey;
}

function selectedTranslationProvider() {
    return aiProviders.value.find((provider) => provider.provider_key === aiSetting.value.provider_key) || null;
}

function usesManagedTranslationBatch() {
    const provider = selectedTranslationProvider();

    return provider?.connection_mode === 'managed'
        && provider?.supports_background_jobs
        && provider?.is_configured;
}

function managedJobIsActive() {
    return ['queued', 'running'].includes(managedTranslationJob.value?.status);
}

function managedBatchCredits() {
    const provider = selectedTranslationProvider();
    const rate = Number(provider?.translation_credits_per_1000_words?.[aiSetting.value.model] || 0);

    return translationBlocks.value.reduce((total, block) => total + Math.ceil((countWords(block.text_plain) / 1000) * rate), 0);
}

function selectedAiModelOptions() {
    return selectedAiProvider()?.models || [];
}

function setAiProvider(value) {
    const providerKey = selectValue(value, aiProviderKey.value);
    const provider = aiProviders.value.find((item) => item.provider_key === providerKey);
    aiProviderKey.value = providerKey;
    aiProviderModel.value = provider?.default_model || provider?.models?.[0] || '';
    aiSettingStatus.value = null;
    loadLmStudioModels();
}

function setAiModel(value) {
    aiProviderModel.value = selectValue(value, aiProviderModel.value);
}

function aiSettingsDialogContent(keyBook, close) {
    const providerOptions = () => aiProviders.value
        .filter((provider) => provider.is_selectable !== false)
        .map((provider) => ({ label: provider.name, value: provider.provider_key }));
    const modelOptions = () => selectedAiModelOptions().map((model) => ({ label: model, value: model }));
    const provider = selectedAiProvider();

    return _.form({
        action: '#',
        method: 'post',
        onSubmit: (event) => {
            event.preventDefault();
            saveTranslationAiSetting(keyBook, close);
        },
    },
        _.Row({ gap: 'md' },
            _.Select({
                class: 'cms-col-24',
                label: 'Provider',
                icon: 'hub',
                model: aiProviderKey,
                options: providerOptions,
                onChange: setAiProvider,
            }),
            _.Select({
                class: 'cms-col-24',
                label: () => loadingAiProviderModels.value ? 'Loading models...' : 'Model',
                icon: 'memory',
                model: aiProviderModel,
                options: modelOptions,
                onChange: setAiModel,
            }),
            provider?.connection_mode !== 'managed' && providerNeedsApiKey(provider?.provider_key) ? _.Input({
                class: 'cms-col-24',
                label: 'API key',
                icon: 'key',
                type: 'password',
                model: aiProviderApiKey,
                placeholder: provider?.has_api_key ? 'A key is already saved. Paste a value only to replace it.' : 'Paste provider API key',
            }) : null,
            _.Textarea({
                class: 'cms-col-24',
                label: 'Literary translation prompt',
                icon: 'terminal',
                rows: 6,
                model: aiSystemPrompt,
            }),
            provider ? _.div({ class: 'cms-col-24' }, _.Alert({
                type: provider.connection_mode === 'managed'
                    ? (provider.is_configured ? 'light' : 'warning')
                    : provider.has_api_key || !providerNeedsApiKey(provider.provider_key) ? 'light' : 'warning',
                title: provider.name,
                message: provider.connection_mode === 'managed'
                    ? provider.is_configured
                        ? `${provider.privacy_label} ${provider.supports_background_jobs ? 'Background translation is available with this provider.' : ''}`
                        : `${provider.privacy_label || 'This managed provider'} is not enabled by Audiobook Tools yet.`
                    : provider.provider_key === 'mock'
                        ? 'Mock is useful for testing only; it does not create a real translation.'
                        : provider.connection_mode === 'local'
                            ? `Local server · ${provider.base_url || 'Provider default endpoint'}`
                            : provider.has_api_key
                                ? `API key saved · ${provider.base_url || 'Provider default endpoint'}`
                                : `An API key is required · ${provider.base_url || 'Provider default endpoint'}`,
            })) : null,
            _.div({ class: 'cms-col-24 at-translateProviderCatalog' },
                _.strong('Audiobook Tools providers'),
                _.small('Managed by AT: no personal API key is requested. Credits and data handling are shown before use.'),
                () => aiProviders.value
                    .filter((item) => item.connection_mode === 'managed' && item.provider_key !== 'mock')
                    .map((item) => _.div({ class: () => item.is_configured ? 'at-translateProviderCatalogItem' : 'at-translateProviderCatalogItem is-unavailable' },
                        _.div(_.strong(item.name), _.small(item.billing_label || 'Audiobook Tools credits')),
                        _.span(item.is_configured ? (item.supports_background_jobs ? 'Background ready' : 'Interactive') : 'Coming soon'),
                    )),
            ),
            () => aiSettingStatus.value ? _.div({ class: 'cms-col-24' }, _.Alert(aiSettingStatus.value)) : null,
        ),
    );
}

async function saveTranslationAiSetting(keyBook, close) {
    if (savingAiSetting.value) return;

    savingAiSetting.value = true;
    aiSettingStatus.value = null;
    try {
        const payload = translationData(await _.http.patchJSON('/dashboard/api/ai/settings', {
            service: 'translate',
            key_book: keyBook,
            provider_key: aiProviderKey.value,
            model: aiProviderModel.value,
            api_key: aiProviderApiKey.value.trim() || null,
            system_prompt: aiSystemPrompt.value.trim(),
        }));
        aiSetting.value = payload.setting || aiSetting.value;
        aiProviderApiKey.value = '';
        await loadAiSetting(keyBook);
        setFeedback('AI translation settings saved for this book.');
        close();
    } catch (error) {
        aiSettingStatus.value = {
            type: 'danger',
            title: 'AI settings not saved',
            message: error.message || 'Unable to save the provider settings.',
        };
    } finally {
        savingAiSetting.value = false;
    }
}

function openAiSettingsDialog(keyBook) {
    aiProviderApiKey.value = '';
    aiSettingStatus.value = null;
    loadAiSetting(keyBook);
    _.Dialog({
        size: 'lg',
        stickyActions: true,
        slots: {
            header: _.div(
                _.h3('Translation AI settings'),
                _.span({ class: 'text-muted' }, 'These settings override the global provider only for this book.'),
            ),
            content: ({ close }) => _.div({ class: 'at-translationAiSettingsDialog' }, () => aiSettingsDialogContent(keyBook, close)),
            actions: ({ close }) => _.div({ class: 'at-translationAiSettingsActions' },
                _.Btn({ type: 'button', color: 'secondary', onClick: close }, 'Cancel'),
                _.Btn({
                    class: 'cms-m-l-sm',
                    type: 'button',
                    color: 'primary',
                    loading: savingAiSetting,
                    disabled: () => !aiProviderKey.value || !aiProviderModel.value || selectedAiProvider()?.is_selectable === false,
                    onClick: () => saveTranslationAiSetting(keyBook, close),
                }, 'Save AI settings'),
            ),
        },
    }).open();
}

async function loadWorkspace(keyBook) {
    if (!keyBook || pageStatus.value === 'loading') return;

    pageStatus.value = 'loading';
    pageError.value = null;

    try {
        const payload = translationData(await _.http.getJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/editor`));
        translationBook.value = payload.book || null;
        translationBlocks.value = (payload.blocks || []).filter((block) => block.text_plain?.trim());
        activeBlockIndex.value = 0;
        pageStatus.value = 'ready';
        await Promise.all([loadTranslations(keyBook), loadAiSetting(keyBook), loadTranslationProgress(keyBook)]);
        loadGlossaryTerms(keyBook);
        loadManagedTranslationJob(keyBook);
        loadCreditBalance();
    } catch (error) {
        pageStatus.value = 'error';
        pageError.value = error.message;
    }
}

async function loadTranslationProgress(keyBook) {
    if (!keyBook) return;

    try {
        const payload = translationData(await _.http.getJSON(
            `/dashboard/api/books/${encodeURIComponent(keyBook)}/translation-progress?target_locale=${encodeURIComponent(targetLocale.value)}`,
        ));
        translationProgress.value = {
            counts: payload.counts || { all: 0, missing: 0, draft: 0, approved: 0, rejected: 0 },
            states: payload.states || {},
        };
    } catch (error) {
        setFeedback(error.message || 'Unable to load translation progress.', 'danger');
    }
}

async function loadGlossaryTerms(keyBook) {
    if (!keyBook) return;

    glossaryStatus.value = 'loading';
    try {
        const payload = translationData(await _.http.getJSON(
            `/dashboard/api/books/${encodeURIComponent(keyBook)}/translation-terms?target_locale=${encodeURIComponent(targetLocale.value)}`,
        ));
        glossaryTerms.value = payload.terms || [];
        glossaryStatus.value = 'ready';
    } catch (error) {
        glossaryStatus.value = 'error';
        setFeedback(error.message || 'Unable to load the glossary.', 'danger');
    }
}

function glossaryDialogContent(keyBook, close) {
    return _.form({
        action: '#',
        method: 'post',
        onSubmit: async (event) => {
            event.preventDefault();
            if (!glossarySourceTerm.value.trim() || !glossaryTargetTerm.value.trim()) return;

            savingGlossaryTerm.value = true;
            try {
                const payload = translationData(await _.http.postJSON(
                    `/dashboard/api/books/${encodeURIComponent(keyBook)}/translation-terms`,
                    {
                        source_term: glossarySourceTerm.value.trim(),
                        target_term: glossaryTargetTerm.value.trim(),
                        target_locale: targetLocale.value,
                        notes: glossaryNotes.value.trim() || null,
                    },
                ));
                glossaryTerms.value = [
                    payload.term,
                    ...glossaryTerms.value.filter((term) => term.id !== payload.term?.id),
                ].sort((left, right) => left.source_term.localeCompare(right.source_term));
                glossarySourceTerm.value = '';
                glossaryTargetTerm.value = '';
                glossaryNotes.value = '';
                setFeedback('Glossary term saved. It will be used in new AI drafts.');
            } catch (error) {
                setFeedback(error.message || 'Unable to save glossary term.', 'danger');
            } finally {
                savingGlossaryTerm.value = false;
            }
        },
    },
        _.div({ class: 'at-glossaryDialog' },
            _.p({ class: 'at-glossaryIntro' }, () => `Terms saved for ${localeLabel(targetLocale.value)} are included in every new AI translation draft.`),
            _.div({ class: 'at-glossaryTerms' }, () => glossaryStatus.value === 'loading'
                ? _.span('Loading glossary…')
                : glossaryTerms.value.length
                    ? glossaryTerms.value.map((term) => _.div({ class: 'at-glossaryTerm' },
                        _.strong(term.source_term),
                        _.span('→'),
                        _.strong(term.target_term),
                        term.notes ? _.small(term.notes) : null,
                    ))
                    : _.span('No terms yet. Add names, places, invented words or preferred wording.'),
            ),
            _.Row({ gap: 'md' },
                _.Input({ class: 'cms-col-12', label: 'Original term', model: glossarySourceTerm, clearable: true }),
                _.Input({ class: 'cms-col-12', label: `${localeLabel(targetLocale.value)} term`, model: glossaryTargetTerm, clearable: true }),
                _.Textarea({ class: 'cms-col-24', label: 'Context note (optional)', rows: 2, model: glossaryNotes }),
                _.div({ class: 'cms-col-24', align: 'right' },
                    _.Btn({ type: 'button', color: 'secondary', onClick: close }, 'Close'),
                    _.Btn({
                        type: 'submit',
                        class: 'cms-m-l-sm',
                        color: 'primary',
                        loading: savingGlossaryTerm,
                        disabled: () => !glossarySourceTerm.value.trim() || !glossaryTargetTerm.value.trim(),
                    }, 'Save term'),
                ),
            ),
        ),
    );
}

function openGlossaryDialog(keyBook) {
    loadGlossaryTerms(keyBook);
    _.Dialog({
        size: 'lg',
        slots: {
            header: _.div(
                _.h3('Translation glossary'),
                _.span({ class: 'text-muted' }, 'Keep names, terminology and the book’s voice consistent.'),
            ),
            content: ({ close }) => glossaryDialogContent(keyBook, close),
        },
    }).open();
}

async function loadTranslations(keyBook) {
    const block = activeBlock();
    if (!keyBook || !block?.block_uuid) return;

    translationsStatus.value = 'loading';
    try {
        const payload = await loadBookBlockTranslations(keyBook, block.block_uuid);
        translations.value = payload.translations || [];
        translationDraft.value = currentTranslation()?.translated_text || '';
        translationsStatus.value = 'ready';
    } catch (error) {
        translations.value = [];
        translationDraft.value = '';
        translationsStatus.value = 'error';
        setFeedback(error.message || 'Unable to load translations.', 'danger');
    }
}

async function saveManualDraft(keyBook) {
    const block = activeBlock();
    if (!block || !translationDraft.value.trim()) return;

    actionStatus.value = 'saving';
    try {
        const payload = await saveManualBookBlockTranslation(keyBook, block.block_uuid, {
            targetLocale: targetLocale.value,
            translatedText: translationDraft.value,
        });
        translations.value = [payload.translation, ...translations.value.filter((item) => item.id !== payload.translation?.id)];
        await loadTranslationProgress(keyBook);
        setFeedback('Manual translation draft saved.');
    } catch (error) {
        setFeedback(error.message || 'Unable to save the translation draft.', 'danger');
    } finally {
        actionStatus.value = 'idle';
    }
}

async function generateAiDraft(keyBook) {
    const block = activeBlock();
    if (!block) return;

    actionStatus.value = 'generating';
    try {
        const payload = await createAiBookBlockTranslation(keyBook, block.block_uuid, {
            targetLocale: targetLocale.value,
            providerKey: aiSetting.value.provider_key,
            model: aiSetting.value.model,
        });
        translations.value = [payload.translation, ...translations.value.filter((item) => item.id !== payload.translation?.id)];
        translationDraft.value = payload.translation?.translated_text || '';
        await loadTranslationProgress(keyBook);
        setFeedback(payload.created ? 'AI translation draft created. Review and edit it before approval.' : 'Existing AI draft loaded.');
    } catch (error) {
        setFeedback(error.message || 'Unable to create an AI translation.', 'danger');
    } finally {
        actionStatus.value = 'idle';
    }
}

function scheduleManagedJobPoll(keyBook) {
    window.clearTimeout(managedJobPollTimer);

    if (!managedJobIsActive()) return;

    managedJobPollTimer = window.setTimeout(() => loadManagedTranslationJob(keyBook), 2500);
}

async function loadManagedTranslationJob(keyBook) {
    if (!keyBook) return;

    try {
        const payload = translationData(await _.http.getJSON(
            `/dashboard/api/books/${encodeURIComponent(keyBook)}/translation-jobs/current?target_locale=${encodeURIComponent(targetLocale.value)}`,
        ));
        managedTranslationJob.value = payload.job || null;

        if (managedJobIsActive()) {
            scheduleManagedJobPoll(keyBook);
        } else if (managedTranslationJob.value?.status) {
            await Promise.all([loadTranslationProgress(keyBook), loadTranslations(keyBook)]);
        }
    } catch (error) {
        setFeedback(error.message || 'Unable to load the background translation batch.', 'danger');
    }
}

async function loadCreditBalance() {
    try {
        creditBalance.value = translationData(await _.http.getJSON('/dashboard/api/ai/credits'));
    } catch {
        // Job start remains server-authoritative when the balance cannot be displayed.
    }
}

function openManagedBatchDialog(keyBook) {
    const pendingBlocks = Math.max(0, translationBlocks.value.length - Number(translationProgress.value.counts?.approved || 0));
    const sourceWords = translationBlocks.value.reduce((total, block) => total + countWords(block.text_plain), 0);

    _.Dialog({
        size: 'md',
        slots: {
            header: _.div(
                _.h3('Start background translation'),
                _.span({ class: 'text-muted' }, 'This batch is processed by Audiobook Tools using OpenAI.'),
            ),
            content: ({ close }) => _.div({ class: 'at-managedBatchDialog' },
                _.Alert({
                    type: 'info',
                    title: `AT · OpenAI · ${aiSetting.value.model}`,
                    message: 'Your manuscript is sent to OpenAI through Audiobook Tools. The batch creates drafts only and never changes approved translations.',
                }),
                _.div({ class: 'at-managedBatchSummary' },
                    _.span('Blocks to review'), _.strong(`${pendingBlocks}`),
                    _.span('Source words'), _.strong(`${sourceWords}`),
                    _.span('Billing'), _.strong(selectedTranslationProvider()?.billing_label || 'Audiobook Tools credits'),
                    _.span('Estimated credits'), _.strong(`${managedBatchCredits()}`),
                    _.span('Available credits'), _.strong(() => `${creditBalance.value.available_credits}`),
                ),
                _.p('You can close this page after confirmation. Progress and any errors remain available in Translation Studio.'),
                _.div({ class: 'at-managedBatchActions' },
                    _.Btn({ type: 'button', color: 'secondary', onClick: close }, 'Cancel'),
                    _.Btn({
                        type: 'button',
                        color: 'primary',
                        loading: managedJobStatus,
                        disabled: () => pendingBlocks === 0 || managedJobStatus.value === 'starting',
                        onClick: () => startManagedTranslationJob(keyBook, close),
                    }, 'Confirm and start'),
                ),
            ),
        },
    }).open();
}

async function startManagedTranslationJob(keyBook, close) {
    if (managedJobStatus.value === 'starting') return;

    managedJobStatus.value = 'starting';
    try {
        const payload = translationData(await _.http.postJSON(
            `/dashboard/api/books/${encodeURIComponent(keyBook)}/translation-jobs`,
            {
                target_locale: targetLocale.value,
                provider_key: aiSetting.value.provider_key,
                model: aiSetting.value.model,
                confirmed: true,
            },
        ));
        managedTranslationJob.value = payload.job || null;
        loadCreditBalance();
        setFeedback(payload.created ? 'Background translation batch started.' : 'A translation batch is already running.');
        close();
        scheduleManagedJobPoll(keyBook);
    } catch (error) {
        setFeedback(error.message || 'Unable to start the background translation batch.', 'danger');
    } finally {
        managedJobStatus.value = 'idle';
    }
}

async function cancelManagedTranslationJob(keyBook) {
    const job = managedTranslationJob.value;
    if (!job || !managedJobIsActive()) return;

    try {
        const payload = translationData(await _.http.patchJSON(
            `/dashboard/api/books/${encodeURIComponent(keyBook)}/translation-jobs/${job.id}/cancel`,
            {},
        ));
        managedTranslationJob.value = payload.job || null;
        window.clearTimeout(managedJobPollTimer);
        await loadCreditBalance();
        setFeedback('Background translation batch cancelled. Unused reserved credits were released.', 'warning');
    } catch (error) {
        setFeedback(error.message || 'Unable to cancel the background translation batch.', 'danger');
    }
}

async function translateAllBlocks(keyBook) {
    if (batchStatus.value === 'translating' || !translationBlocks.value.length) return;

    batchStatus.value = 'translating';
    batchProgress.value = { completed: 0, total: translationBlocks.value.length, failed: 0 };
    let failed = 0;
    let failureMessage = null;

    for (let index = 0; index < translationBlocks.value.length; index += 1) {
        const block = translationBlocks.value[index];

        try {
            await createAiBookBlockTranslation(keyBook, block.block_uuid, {
                targetLocale: targetLocale.value,
                providerKey: aiSetting.value.provider_key,
                model: aiSetting.value.model,
            });
        } catch (error) {
            failed += 1;
            failureMessage = error.message || 'The AI provider could not translate this block.';
        }

        batchProgress.value = {
            completed: index + 1,
            total: translationBlocks.value.length,
            failed,
        };

        if (failed) break;
    }

    batchStatus.value = 'idle';
    await loadTranslations(keyBook);
    await loadTranslationProgress(keyBook);
    setFeedback(failed
        ? `Translation batch paused after ${batchProgress.value.completed} blocks: ${failureMessage}`
        : `Translation batch complete: ${translationBlocks.value.length} blocks are ready for review.`, failed ? 'warning' : 'success');
}

async function resolveTranslation(keyBook, status) {
    const block = activeBlock();
    const translation = currentTranslation();
    if (!block || !translation) return;

    actionStatus.value = status === 'approved' ? 'approving' : 'saving';
    try {
        const payload = await resolveBookBlockTranslation(keyBook, block.block_uuid, translation.id, status);
        translations.value = [payload.translation, ...translations.value.filter((item) => item.id !== payload.translation?.id)];
        await loadTranslationProgress(keyBook);
        setFeedback('Translation approved and ready for export.');
    } catch (error) {
        setFeedback(error.message || 'Unable to approve this translation.', 'danger');
    } finally {
        actionStatus.value = 'idle';
    }
}

function openApproveAllDialog(keyBook) {
    const pending = Number(translationProgress.value.counts?.draft || 0) + Number(translationProgress.value.counts?.rejected || 0);
    _.Dialog({
        size: 'sm',
        stickyActions: true,
        slots: {
            header: _.div(_.h3('Approve all translations?'), _.span({ class: 'text-muted' }, `${pending} translation${pending === 1 ? '' : 's'} will be approved for ${localeLabel(targetLocale.value)}.`)),
            content: _.div(
                _.p('This makes every current draft and rejected translation available in the selected edition.'),
                _.small({ class: 'text-muted' }, 'Missing translations are not created or approved.'),
            ),
            actions: ({ close }) => [
                _.Btn({ color: 'secondary', onClick: close }, 'Cancel'),
                _.Btn({
                    color: 'primary', icon: 'check', loading: approveAllRunning, onClick: async () => {
                        approveAllRunning.value = true;
                        try {
                            const payload = translationData(await _.http.postJSON(`/dashboard/api/books/${encodeURIComponent(keyBook)}/translations/approve-all`, { target_locale: targetLocale.value }));
                            await Promise.all([loadTranslations(keyBook), loadTranslationProgress(keyBook)]);
                            setFeedback(`${payload.approved_count || 0} translation${Number(payload.approved_count || 0) === 1 ? '' : 's'} approved.`);
                            close();
                        } catch (error) {
                            setFeedback(error.message || 'Unable to approve all translations.', 'danger');
                        } finally {
                            approveAllRunning.value = false;
                        }
                    }
                }, 'Approve all'),
            ],
        },
    }).open();
}

async function copySource(text) {
    try {
        await globalThis.navigator?.clipboard?.writeText(text || '');
        setFeedback('Original text copied to the clipboard.');
    } catch {
        setFeedback('Clipboard access is not available in this browser.', 'warning');
    }
}

export default function bookTraslate(ctx) {
    const keyBook = bookKey(ctx);
    loadWorkspace(keyBook);
    window.AudiobookTools?.setPageHeaderActions?.([
        bookPanelButton(keyBook),
    ]);

    return _.div({ class: 'at-translateRoute' }, () => pageContent(keyBook));
}
