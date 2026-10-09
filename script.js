
(() => {
    'use strict';

    const $ = selector => document.querySelector(selector);

    const file = $('#file');
    const drop = $('#drop');
    const processButton = $('#process');
    const original = $('#original');
    const originalBox = $('#originalBox');
    const result = $('#result');
    const output = $('#output');

    let selected = null;
    let preset = 'v2';
    let originalURL = null;
    let resultURL = null;
    let busy = false;

    // Configurações para reduzir o uso de memória.
    const CHUNK_SECONDS = 10;
    const OVERLAP_SECONDS = 0.15;
    const TARGET_RATE = 32000;
    const MAX_MB = 60;
    const MAX_MINUTES = 12;

    // PRESETS
    document.querySelectorAll('.preset').forEach(button => {
        button.addEventListener('click', () => {
            if (busy) return;

            document.querySelectorAll('.preset').forEach(item => {
                item.classList.remove('active');
            });

            button.classList.add('active');
            preset = button.dataset.preset || 'v2';
        });
    });

    // SELEÇÃO DO FICHEIRO
    file.addEventListener('change', event => {
        const chosen = event.target.files?.[0];

        if (chosen) {
            setFile(chosen);
        }
    });

    // ARRASTAR E LARGAR
    ['dragenter', 'dragover'].forEach(eventName => {
        drop.addEventListener(eventName, event => {
            event.preventDefault();
            drop.classList.add('drag');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        drop.addEventListener(eventName, event => {
            event.preventDefault();
            drop.classList.remove('drag');
        });
    });

    drop.addEventListener('drop', event => {
        const chosen = [
            ...(event.dataTransfer?.files || [])
        ].find(item =>
            item.type.startsWith('audio/') ||
            /\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(item.name)
        );

        if (chosen) {
            setFile(chosen);
        }
    });

    // DEFINIR MÚSICA
    function setFile(audioFile) {
        if (busy) return;

        const validAudio =
            audioFile.type.startsWith('audio/') ||
            /\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(audioFile.name);

        if (!validAudio) {
            alert('Escolhe um ficheiro de áudio válido.');
            return;
        }

        if (audioFile.size > MAX_MB * 1024 * 1024) {
            alert(
                `O ficheiro ultrapassa ${MAX_MB} MB. ` +
                'Escolhe um ficheiro menor para evitar bloqueios.'
            );

            file.value = '';
            return;
        }

        selected = audioFile;

        $('#fileName').textContent = audioFile.name;
        $('#originalName').textContent = audioFile.name;

        if (originalURL) {
            URL.revokeObjectURL(originalURL);
        }

        originalURL = URL.createObjectURL(audioFile);
        original.src = originalURL;

        originalBox.classList.remove('hidden');
        result.classList.add('hidden');
        $('#progress').classList.add('hidden');

        processButton.disabled = false;

        setProgress(0, 'Pronto para processar.');
    }

    // PROCESSAMENTO
    processButton.addEventListener('click', async () => {
        if (!selected || busy) return;

        busy = true;

        processButton.disabled = true;
        processButton.textContent = '⚡ PROCESSANDO...';

        $('#progress').classList.remove('hidden');
        result.classList.add('hidden');

        let context = null;
        let mp3Parts = [];

        try {
            if (typeof lamejs === 'undefined') {
                throw new Error(
                    'A biblioteca MP3 não carregou. ' +
                    'Verifica a ligação à internet e tenta novamente.'
                );
            }

            const AudioCtx =
                window.AudioContext ||
                window.webkitAudioContext;

            const OfflineCtx =
                window.OfflineAudioContext ||
                window.webkitOfflineAudioContext;

            if (!AudioCtx || !OfflineCtx) {
                throw new Error(
                    'Este navegador não suporta o processamento de áudio necessário.'
                );
            }

            setProgress(3, 'A preparar a descodificação...');

            try {
                context = new AudioCtx({
                    sampleRate: TARGET_RATE
                });
            } catch (_) {
                context = new AudioCtx();
            }

            // A música descodificada continua a ocupar memória.
            // O processamento em blocos reduz a memória temporária adicional.
            setProgress(5, 'A descodificar a música...');

            let compressedData = await selected.arrayBuffer();

            const decoded = await context.decodeAudioData(
                compressedData
            );

            compressedData = null;

            if (decoded.duration > MAX_MINUTES * 60) {
                throw new Error(
                    `A música ultrapassa ${MAX_MINUTES} minutos. ` +
                    'Escolhe uma faixa mais curta para evitar falta de memória.'
                );
            }

            const sampleRate = decoded.sampleRate;
            const channels = Math.min(2, decoded.numberOfChannels);

            const encoder = new lamejs.Mp3Encoder(
                channels,
                sampleRate,
                320
            );

            const left = decoded.getChannelData(0);

            const right = channels > 1
                ? decoded.getChannelData(1)
                : null;

            const totalFrames = decoded.length;

            const chunkFrames = Math.max(
                1,
                Math.floor(CHUNK_SECONDS * sampleRate)
            );

            const overlapFrames = Math.floor(
                OVERLAP_SECONDS * sampleRate
            );

            const totalChunks = Math.ceil(
                totalFrames / chunkFrames
            );

            // Processar um bloco de cada vez.
            for (let index = 0; index < totalChunks; index++) {
                if (index > 0) {
                    await yieldToBrowser();
                }

                const coreStart = index * chunkFrames;

                const coreEnd = Math.min(
                    totalFrames,
                    coreStart + chunkFrames
                );

                const renderStart = Math.max(
                    0,
                    coreStart - overlapFrames
                );

                const renderEnd = Math.min(
                    totalFrames,
                    coreEnd + overlapFrames
                );

                const renderLength = renderEnd - renderStart;

                const percent = 5 + Math.round(
                    (index / totalChunks) * 80
                );

                setProgress(
                    percent,
                    `A aplicar Bass Boost ${preset.toUpperCase()} ` +
                    `— bloco ${index + 1}/${totalChunks}...`
                );

                const offline = new OfflineCtx(
                    channels,
                    renderLength,
                    sampleRate
                );

                const chunkBuffer = offline.createBuffer(
                    channels,
                    renderLength,
                    sampleRate
                );

                chunkBuffer.copyToChannel(
                    left.subarray(renderStart, renderEnd),
                    0
                );

                if (channels > 1 && right) {
                    chunkBuffer.copyToChannel(
                        right.subarray(renderStart, renderEnd),
                        1
                    );
                }

                const source = offline.createBufferSource();

                source.buffer = chunkBuffer;

                const chain = createChain(
                    offline,
                    preset
                );

                source.connect(chain.input);
                chain.output.connect(offline.destination);

                source.start(0);

                const rendered = await offline.startRendering();

                const keepStart = coreStart - renderStart;

                const keepEnd =
                    keepStart + (coreEnd - coreStart);

                encodeRange(
                    rendered,
                    keepStart,
                    keepEnd,
                    encoder,
                    mp3Parts
                );

                source.disconnect();
                chain.input.disconnect();
                chain.output.disconnect();
            }

            // FINALIZAR MP3
            setProgress(88, 'A finalizar o ficheiro MP3...');

            const finalBytes = encoder.flush();

            if (finalBytes.length) {
                mp3Parts.push(new Uint8Array(finalBytes));
            }

            const blob = new Blob(mp3Parts, {
                type: 'audio/mpeg'
            });

            if (resultURL) {
                URL.revokeObjectURL(resultURL);
            }

            resultURL = URL.createObjectURL(blob);

            output.src = resultURL;

            const baseName = selected.name.replace(
                /\.[^/.]+$/,
                ''
            );

            const downloadName =
                baseName + '_bassbooster_rS.mp3';

            const downloadLink = $('#download');

            downloadLink.href = resultURL;
            downloadLink.download = downloadName;

            $('#downloadName').textContent = downloadName;

            setProgress(100, 'Concluído.');

            result.classList.remove('hidden');

            result.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });

        } catch (error) {
            console.error(error);

            alert(
                error?.message ||
                'Não foi possível processar este áudio. ' +
                'Tenta uma música mais curta ou um ficheiro menor.'
            );

        } finally {
            if (context && context.state !== 'closed') {
                try {
                    await context.close();
                } catch (_) {}
            }

            mp3Parts.length = 0;

            busy = false;

            processButton.disabled = !selected;

            processButton.textContent = '⚡ PROCESSAR ÁUDIO';
        }
    });

    // CADEIA DE EFEITOS
    function createChain(context, selectedPreset) {
        const input = context.createGain();
        const output = context.createGain();

        const sub30 = context.createBiquadFilter();
        const low = context.createBiquadFilter();
        const bass60 = context.createBiquadFilter();
        const mid = context.createBiquadFilter();
        const body = context.createBiquadFilter();
        const lowMid = context.createBiquadFilter();
        const voice = context.createBiquadFilter();
        const presence = context.createBiquadFilter();

        const compressor =
            context.createDynamicsCompressor();

        const makeup = context.createGain();

        const limiter =
            context.createDynamicsCompressor();

        // Subgrave
        sub30.type = 'peaking';
        sub30.frequency.value = 30;
        sub30.Q.value = 0.75;
        sub30.gain.value =
            selectedPreset === 'v4' ? 8 : 0;

        // Grave principal
        low.type = 'lowshelf';
        low.frequency.value = 45;

        low.gain.value =
            selectedPreset === 'v2' ? 11 :
            selectedPreset === 'v3' ? 12 : 13;

        // Impacto de 60 Hz
        bass60.type = 'peaking';
        bass60.frequency.value = 60;
        bass60.Q.value = 0.8;
        bass60.gain.value =
            selectedPreset === 'v4' ? 10 : 0;

        // Grave médio
        mid.type = 'peaking';

        mid.frequency.value =
            selectedPreset === 'v2' ? 85 :
            selectedPreset === 'v3' ? 75 : 80;

        mid.Q.value = 0.9;

        mid.gain.value =
            selectedPreset === 'v2' ? 7 :
            selectedPreset === 'v3' ? 8.5 : 8;

        // Corpo do grave
        body.type = 'peaking';
        body.frequency.value =
            selectedPreset === 'v4' ? 110 : 115;

        body.Q.value = 0.85;

        body.gain.value =
            selectedPreset === 'v2' ? 2 :
            selectedPreset === 'v3' ? 3 : 5;

        // Médios baixos
        lowMid.type = 'peaking';
        lowMid.frequency.value = 150;
        lowMid.Q.value = 0.8;
        lowMid.gain.value =
            selectedPreset === 'v4' ? 1 : 0;

        // Voz e médios
        voice.type = 'peaking';

        voice.frequency.value =
            selectedPreset === 'v4' ? 220 : 3200;

        voice.Q.value =
            selectedPreset === 'v4' ? 0.9 : 1;

        voice.gain.value =
            selectedPreset === 'v4' ? -2 :
            selectedPreset === 'v3' ? -1.8 : 0;

        // Limpeza dos médios
        presence.type = 'peaking';
        presence.frequency.value = 350;
        presence.Q.value = 0.9;
        presence.gain.value =
            selectedPreset === 'v4' ? -3 : 0;

        // Compressor
        compressor.threshold.value =
            selectedPreset === 'v4' ? -19 : -18.4;

        compressor.ratio.value =
            selectedPreset === 'v4' ? 2.8 : 2.6;

        compressor.attack.value = 0.008;
        compressor.release.value = 0.12;
        compressor.knee.value = 10;

        // Ganho de compensação
        makeup.gain.value =
            selectedPreset === 'v4' ? 1.02 : 1.08;

        // Limitador
        limiter.threshold.value =
            selectedPreset === 'v4' ? -0.9 : -0.8;

        limiter.ratio.value = 20;
        limiter.attack.value = 0.005;
        limiter.release.value = 0.08;

        // Ligações dos filtros
        if (selectedPreset === 'v4') {
            input
                .connect(sub30)
                .connect(low)
                .connect(bass60)
                .connect(mid)
                .connect(body)
                .connect(lowMid)
                .connect(voice)
                .connect(presence)
                .connect(compressor)
                .connect(makeup)
                .connect(limiter)
                .connect(output);

        } else {
            input
                .connect(low)
                .connect(mid)
                .connect(body)
                .connect(voice)
                .connect(compressor)
                .connect(makeup)
                .connect(limiter)
                .connect(output);
        }

        return {
            input,
            output
        };
    }

    // CONVERTER UM BLOCO PARA O ENCODER MP3
    function encodeRange(
        buffer,
        startFrame,
        endFrame,
        encoder,
        parts
    ) {
        const channels = Math.min(
            2,
            buffer.numberOfChannels
        );

        const left = buffer.getChannelData(0);

        const right = channels > 1
            ? buffer.getChannelData(1)
            : null;

        const blockSize = 1152;

        for (
            let frame = startFrame;
            frame < endFrame;
            frame += blockSize
        ) {
            const end = Math.min(
                frame + blockSize,
                endFrame
            );

            const left16 = toInt16(
                left.subarray(frame, end)
            );

            let encoded;

            if (channels > 1 && right) {
                const right16 = toInt16(
                    right.subarray(frame, end)
                );

                encoded = encoder.encodeBuffer(
                    left16,
                    right16
                );

            } else {
                encoded = encoder.encodeBuffer(left16);
            }

            if (encoded.length) {
                parts.push(new Uint8Array(encoded));
            }
        }
    }

    // FLOAT PARA INT16
    function toInt16(samples) {
        const outputSamples =
            new Int16Array(samples.length);

        for (let i = 0; i < samples.length; i++) {
            const sample = Math.max(
                -1,
                Math.min(1, samples[i])
            );

            outputSamples[i] = sample < 0
                ? sample * 32768
                : sample * 32767;
        }

        return outputSamples;
    }

    // BARRA DE PROGRESSO
    function setProgress(percent, message) {
        const bar = $('#bar');
        const percentLabel = $('#percent');
        const progressText = $('#progressText');

        if (bar) {
            bar.style.width = percent + '%';
        }

        if (percentLabel) {
            percentLabel.textContent =
                Math.round(percent) + '%';
        }

        if (progressText) {
            progressText.textContent = message;
        }
    }

    // DAR OPORTUNIDADE AO NAVEGADOR DE RESPONDER
    function yieldToBrowser() {
        return new Promise(resolve => {
            setTimeout(resolve, 0);
        });
    }

})();
