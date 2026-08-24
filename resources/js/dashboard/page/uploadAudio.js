import '../../../css/uploadAudio.css';

const voices = _.rod([]);
const tones = _.rod([]);
const loading = _.rod(false);
const search = _.rod('');
const status = _.rod(null);
const saving = _.rod(false);

function dataOf(payload) { return payload?.data?.data || payload?.data || payload || {}; }
function languageOptions() { return Object.entries({ it: 'Italiano', en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', pt: 'Português' }).map(([value, label]) => ({ value, label })); }
function toneOptions() { return tones.value.map((tone) => ({ value: tone.id, label: `#${tone.id} · ${tone.name}` })); }
function selectedTone(sample) { return tones.value.find((tone) => tone.id === Number(sample.toneId.value)); }
function sampleState(sample = {}) {
    return {
        ...sample,
        toneId: _.rod(Number(sample.tone_id || sample.tone?.id || 3)),
        descriptionModel: _.rod(sample.description || ''),
        referenceTextModel: _.rod(sample.reference_text || ''),
        file: null,
        fileName: _.rod(sample.original_name || ''),
    };
}

async function loadVoices() {
    loading.value = true;
    try {
        const library = dataOf(await _.http.getJSON(`/dashboard/api/audio-library/voices?search=${encodeURIComponent(search.value)}`));
        voices.value = library.voices || [];
        tones.value = library.tones || [];
    }
    catch (error) { status.value = { type: 'danger', message: error.message || 'Unable to load the audio library.' }; }
    finally { loading.value = false; }
}

function openVoiceDialog(existing = null) {
    const initial = CMSwift.reactive.untracked(() => ({
        name: existing?.name || '',
        type: existing?.type || 'female',
        language: existing?.language || 'it',
        description: existing?.description || '',
    }));
    const name = _.rod(initial.name);
    const type = _.rod(initial.type);
    const language = _.rod(initial.language);
    const description = _.rod(initial.description);
    let samples = CMSwift.reactive.untracked(() => (existing?.samples || []).map((sample) => sampleState(sample)));
    const dialogStatus = _.rod(null);
    const sampleList = _.div({ class: 'at-uploadAudioSamples' });
    const emptySamples = _.div({ class: 'at-uploadAudioEmptySamples' }, 'Add at least one sample to make this voice available for preview.');
    const syncSampleList = () => {
        emptySamples.hidden = samples.length > 0;
    };
    const removeSample = (sample, row) => {
        samples = samples.filter((item) => item !== sample);
        row.remove();
        syncSampleList();
    };
    const createSampleRow = (sample) => {
        let row;
        row = _.div({ class: 'at-uploadAudioSample' },
            _.small({ class: 'at-uploadAudioFileName' }, () => sample.fileName.value || 'Choose WAV, MP3, M4A or OGG'),
            _.div({ class: 'at-uploadAudioSampleControls' },
                _.Select({ label: 'Tone', model: sample.toneId, options: toneOptions }),
                _.input({ type: 'file', accept: 'audio/*', class: 'at-uploadAudioFile', onchange: (event) => { const file = event.target.files?.[0]; sample.file = file; sample.fileName.value = file?.name || sample.fileName.value; } }),
                _.Btn({ dense: true, color: 'danger', icon: 'delete_outline', title: 'Remove sample', onClick: () => removeSample(sample, row) }),
            ),
            _.Textarea({ label: 'Tone notes', rows: 2, model: sample.descriptionModel }),
            _.Textarea({ label: 'Words spoken in this sample', rows: 2, model: sample.referenceTextModel, placeholder: 'Generated automatically after upload; review or correct it for accurate Qwen cloning.' }),
            _.div({ class: 'at-uploadAudioToneHint' }, _.Icon({ name: 'info' }), () => selectedTone(sample)?.description || 'Select a tone to see its performance direction.'),
            sample.audio_url ? _.audio({ controls: true, src: sample.audio_url }) : null,
        );
        return row;
    };
    const addSample = () => {
        const sample = sampleState({ tone_id: CMSwift.reactive.untracked(() => tones.value[0]?.id || 3) });
        samples.push(sample);
        sampleList.appendChild(createSampleRow(sample));
        syncSampleList();
    };
    samples.forEach((sample) => sampleList.appendChild(createSampleRow(sample)));
    syncSampleList();
    const save = async (close) => {
        if (!name.value.trim()) { dialogStatus.value = { type: 'warning', message: 'Voice name is required.' }; return; }
        saving.value = true; dialogStatus.value = null;
        try {
            const form = new FormData();
            form.append('name', name.value.trim()); form.append('type', type.value); form.append('language', language.value); form.append('description', description.value);
            samples.forEach((sample, index) => { if (sample.id) form.append(`samples[${index}][id]`, sample.id); form.append(`samples[${index}][tone_id]`, sample.toneId.value); form.append(`samples[${index}][description]`, sample.descriptionModel.value); form.append(`samples[${index}][reference_text]`, sample.referenceTextModel.value); if (sample.file) form.append(`samples[${index}][file]`, sample.file); });
            // Multipart is required for audio files; CMSwift request keeps its CSRF headers and HTTP handling.
            const response = await _.http.request(existing ? `/dashboard/api/audio-library/voices/${existing.id}` : '/dashboard/api/audio-library/voices', { method: 'POST', body: form });
            const saved = dataOf(await response.jsonStrict()).voice;
            voices.value = [saved, ...voices.value.filter((voice) => voice.id !== saved.id)];
            status.value = { type: 'success', message: existing ? 'Voice updated and its new samples transcribed.' : 'Voice added and its samples transcribed for Qwen cloning.' };
            close();
        } catch (error) { dialogStatus.value = { type: 'danger', message: error.message || 'Unable to save this voice.' }; }
        finally { saving.value = false; }
    };
    _.Dialog({
        size: 'xl', stickyActions: true, slots: {
            header: _.div(_.h3(existing ? 'Edit voice' : 'Add voice'), _.span({ class: 'text-muted' }, 'Upload one or more performance samples for this voice.')),
            content: ({ close }) => _.div({ class: 'at-uploadAudioDialog' },
                _.div({ class: 'at-uploadAudioVoiceFields' },
                    _.Input({ label: 'Voice name', model: name, icon: 'record_voice_over', placeholder: 'e.g. Elara' }),
                    _.Select({ label: 'Voice type', model: type, options: [{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'neutral', label: 'Neutral' }] }),
                    _.Select({ label: 'Language', model: language, options: languageOptions() }),
                ),
                _.div(
                    _.Textarea({ class: 'cms-col-24', label: 'Voice description', model: description, rows: 3, placeholder: 'Age, accent, character and performance notes.' }),
                ),
                _.div({ class: 'at-uploadAudioSamplesHead' }, _.div(_.strong('Tone samples'), _.small('Each sample represents a performance direction available to this voice.')), _.Btn({ color: 'secondary', icon: 'add', onClick: addSample }, 'Add sample')),
                emptySamples,
                sampleList,
                () => dialogStatus.value ? _.Alert(dialogStatus.value) : null,
                _.div({ class: 'at-uploadAudioDialogActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Cancel'), _.Btn({ color: 'primary', loading: saving, icon: 'save', onClick: () => save(close) }, existing ? 'Save changes' : 'Add voice')),
            ),
        }
    }).open();
}

function defaultDesignReference(language) {
    return language === 'it'
        ? 'Questa è una breve frase di riferimento per creare una voce naturale e riconoscibile.'
        : 'This is a short reference sentence used to create a natural and recognizable voice.';
}

function openDesignVoiceDialog() {
    const name = _.rod(''); const type = _.rod('female'); const language = _.rod('it'); const description = _.rod('');
    const dialogStatus = _.rod(null); let designs = [];
    const designList = _.div({ class: 'at-uploadAudioSamples' });
    const emptyDesigns = _.div({ class: 'at-uploadAudioEmptySamples' }, 'Add at least one tone design to generate this voice.');
    const syncDesignList = () => { emptyDesigns.hidden = designs.length > 0; };
    const removeDesign = (design, row) => { designs = designs.filter((item) => item !== design); row.remove(); syncDesignList(); };
    const createDesignRow = (design) => {
        let row;
        row = _.div({ class: 'at-uploadAudioSample' },
            _.div({ class: 'at-uploadAudioSampleControls' },
                _.Select({ label: 'Tone', model: design.toneId, options: toneOptions }),
                _.div({ class: 'at-uploadAudioDesignLabel' }, _.Icon({ name: 'auto_awesome' }), _.span('Qwen VoiceDesign · quality 1.7B')),
                _.Btn({ dense: true, color: 'danger', icon: 'delete_outline', title: 'Remove tone design', onClick: () => removeDesign(design, row) }),
            ),
            _.Textarea({ label: 'Tone design prompt', rows: 3, model: design.prompt, placeholder: 'Example: Warm, intimate narrator voice with a calm pace and a subtle mysterious undertone.' }),
            _.Textarea({ label: 'Reference phrase to generate', rows: 2, model: design.referenceText, placeholder: 'This phrase becomes the saved reference used for later cloning.' }),
            _.div({ class: 'at-uploadAudioToneHint' }, _.Icon({ name: 'info' }), _.span('The voice description and this tone prompt are combined before Qwen generates the reference WAV.')),
        );
        return row;
    };
    const addDesign = () => {
        const design = { toneId: _.rod(CMSwift.reactive.untracked(() => tones.value[0]?.id || 3)), prompt: _.rod(''), referenceText: _.rod(CMSwift.reactive.untracked(() => defaultDesignReference(language.value))) };
        designs.push(design); designList.appendChild(createDesignRow(design)); syncDesignList();
    };
    const save = async (close) => {
        if (!name.value.trim()) { dialogStatus.value = { type: 'warning', message: 'Voice name is required.' }; return; }
        if (!designs.length) { dialogStatus.value = { type: 'warning', message: 'Add at least one tone design.' }; return; }
        if (designs.some((design) => !design.prompt.value.trim() || !design.referenceText.value.trim())) { dialogStatus.value = { type: 'warning', message: 'Every tone needs both a design prompt and a reference phrase.' }; return; }
        saving.value = true; dialogStatus.value = null;
        try {
            const payload = await _.http.postJSON('/dashboard/api/audio-library/design-voices', { name: name.value.trim(), type: type.value, language: language.value, description: description.value.trim() || null, tones: designs.map((design) => ({ tone_id: Number(design.toneId.value), design_prompt: design.prompt.value.trim(), reference_text: design.referenceText.value.trim() })) }, { timeout: 900000, retry: { attempts: 0 } });
            const saved = dataOf(payload).voice;
            voices.value = [saved, ...voices.value.filter((voice) => voice.id !== saved.id)];
            status.value = { type: 'success', message: 'Designed voice generated and added to the audio library.' }; close();
        } catch (error) { dialogStatus.value = { type: 'danger', message: error.message || 'Unable to generate the designed voice.' }; }
        finally { saving.value = false; }
    };
    _.Dialog({
        size: 'xl', stickyActions: true, slots: {
            header: _.div(_.h3('Add design voice'), _.span({ class: 'text-muted' }, 'Describe a voice, then generate a reusable Qwen reference for each tone.')),
            content: ({ close }) => _.div({ class: 'at-uploadAudioDialog' },
                _.div({ class: 'at-uploadAudioVoiceFields' }, _.Input({ label: 'Voice name', model: name, icon: 'record_voice_over', placeholder: 'e.g. Elara' }), _.Select({ label: 'Voice type', model: type, options: [{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'neutral', label: 'Neutral' }] }), _.Select({ label: 'Language', model: language, options: languageOptions() })),
                _.Textarea({ class: 'cms-col-24', label: 'Voice description', model: description, rows: 3, placeholder: 'Age, accent, vocal texture, character and general performance.' }),
                _.div({ class: 'at-uploadAudioSamplesHead' }, _.div(_.strong('Tone designs'), _.small('Each tone creates its own reference sample, ready for Qwen cloning.')), _.Btn({ color: 'secondary', icon: 'add', onClick: addDesign }, 'Add tone design')),
                emptyDesigns, designList, () => dialogStatus.value ? _.Alert(dialogStatus.value) : null,
                _.div({ class: 'at-uploadAudioDialogActions' }, _.Btn({ color: 'secondary', onClick: close }, 'Cancel'), _.Btn({ color: 'primary', loading: saving, icon: 'auto_awesome', onClick: () => save(close) }, 'Generate design voice')),
            ),
        }
    }).open();
    addDesign();
}

async function deleteVoice(voice) {
    if (!window.confirm(`Delete ${voice.name} and all its tone samples?`)) return;
    try { await _.http.delJSON(`/dashboard/api/audio-library/voices/${voice.id}`); voices.value = voices.value.filter((item) => item.id !== voice.id); status.value = { type: 'success', message: 'Voice deleted.' }; }
    catch (error) { status.value = { type: 'danger', message: error.message || 'Unable to delete voice.' }; }
}

export default function uploadAudio() {
    loadVoices();
    return _.main({ class: 'at-uploadAudioPage' },
        _.section({ class: 'at-uploadAudioHeader' }, _.div(_.span({ class: 'at-uploadAudioEyebrow' }, 'Audio'), _.h2('Voices & tone samples'), _.p('Keep uploaded and designed voice references ready for every audiobook.')), _.div({ class: 'at-uploadAudioHeaderActions' }, _.Btn({ color: 'secondary', icon: 'upload_file', onClick: () => openVoiceDialog() }, 'Add voice'), _.Btn({ class: 'cms-m-l-sm', color: 'primary', icon: 'auto_awesome', onClick: () => openDesignVoiceDialog() }, 'Add design voice'))),
        () => status.value ? _.Alert(status.value) : null,
        _.section({ class: 'at-uploadAudioLibrary' },
            _.div({ class: 'at-uploadAudioToolbar' }, _.Input({ label: false, model: search, icon: 'search', placeholder: 'Search voice, language or notes…', onInput: () => loadVoices() }), _.span(() => `${voices.value.length} voice${voices.value.length === 1 ? '' : 's'}`)),
            () => loading.value ? _.div({ class: 'at-uploadAudioLoading' }, 'Loading audio library…') : voices.value.length ? _.div({ class: 'at-uploadAudioRows' }, voices.value.map((voice) => _.article({ class: 'at-uploadAudioVoiceRow' },
                _.div({ class: 'at-uploadAudioVoiceIdentity' },
                    _.div(_.h3(voice.name), _.span(`${voice.type} · ${voice.language.toUpperCase()}`)),
                    _.p(voice.description || 'No voice description.'),
                ),
                _.div({ class: 'at-uploadAudioToneList' }, voice.samples.length ? voice.samples.map((sample) => _.div({ class: 'at-uploadAudioToneRow' },
                    _.span({ class: 'at-uploadAudioToneDot', style: { backgroundColor: sample.tone?.color || '#64748b' } }),
                    _.div({ class: 'at-uploadAudioToneCopy' }, _.strong(() => sample.tone ? `#${sample.tone.id} · ${sample.tone.name}` : 'Unclassified tone'), _.small(sample.description || sample.tone?.description || sample.original_name || 'Audio sample')),
                    _.audio({ controls: true, preload: 'metadata', src: sample.audio_url }),
                )) : _.small('No tone samples uploaded yet.')),
                _.div({ class: 'at-uploadAudioVoiceActions' },
                    _.Btn({ dense: true, color: 'secondary', icon: 'edit', title: 'Edit voice', onClick: () => openVoiceDialog(voice) }),
                    _.Btn({ dense: true, color: 'danger', icon: 'delete_outline', title: 'Delete voice', onClick: () => deleteVoice(voice) }),
                ),
            ))) : _.div({ class: 'at-uploadAudioEmpty' }, _.Icon ? _.Icon({ name: 'library_music' }) : '◌', _.h3('Your audio library is empty'), _.p('Add a voice and upload its tone samples to reuse it across books.'), _.Btn({ color: 'primary', icon: 'add', onClick: () => openVoiceDialog() }, 'Add first voice')),
        ),
    );
}
