const $ = s => document.querySelector(s);

const file = $('#file');
const drop = $('#drop');
const process = $('#process');
const original = $('#original');
const originalBox = $('#originalBox');
const result = $('#result');
const output = $('#output');

let selected = null;
let preset = 'v2';
let originalURL = null;
let resultURL = null;


/* ===============================
   PRESETS
================================ */

document.querySelectorAll('.preset').forEach(button => {

    button.onclick = () => {

        document
            .querySelectorAll('.preset')
            .forEach(x => x.classList.remove('active'));

        button.classList.add('active');

        preset = button.dataset.preset;

    };

});


/* ===============================
   SELEÇÃO DO ARQUIVO
================================ */

file.onchange = e => {

    if (e.target.files[0]) {
        setFile(e.target.files[0]);
    }

};


/* ===============================
   DRAG & DROP
================================ */

['dragenter', 'dragover'].forEach(eventName => {

    drop.addEventListener(eventName, e => {

        e.preventDefault();

        drop.classList.add('drag');

    });

});


['dragleave', 'drop'].forEach(eventName => {

    drop.addEventListener(eventName, e => {

        e.preventDefault();

        drop.classList.remove('drag');

    });

});


drop.ondrop = e => {

    const f = [...e.dataTransfer.files]
        .find(x => x.type.startsWith('audio/'));

    if (f) {
        setFile(f);
    }

};


/* ===============================
   DEFINIR ARQUIVO
================================ */

function setFile(f) {

    if (!f.type.startsWith('audio/')) {

        alert('Escolha um arquivo de áudio válido.');

        return;
    }

    selected = f;

    $('#fileName').textContent = f.name;
    $('#originalName').textContent = f.name;

    if (originalURL) {
        URL.revokeObjectURL(originalURL);
    }

    originalURL = URL.createObjectURL(f);

    original.src = originalURL;

    originalBox.classList.remove('hidden');

    process.disabled = false;

    result.classList.add('hidden');

}


/* ===============================
   PROCESSAMENTO
================================ */

process.onclick = async () => {

    if (!selected) return;

    process.disabled = true;

    process.textContent = '⚡ PROCESSANDO...';

    $('#progress').classList.remove('hidden');

    result.classList.add('hidden');

    setProgress(3, 'Lendo áudio...');


    try {

        const AC =
            window.AudioContext ||
            window.webkitAudioContext;

        const ctx = new AC();


        setProgress(10, 'Decodificando áudio...');


        const decoded =
            await ctx.decodeAudioData(
                await selected.arrayBuffer()
            );


        await ctx.close();


        setProgress(
            20,
            `Aplicando Bass Boost ${preset.toUpperCase()}...`
        );


        const OAC =
            window.OfflineAudioContext ||
            window.webkitOfflineAudioContext;


        const off =
            new OAC(
                decoded.numberOfChannels,
                decoded.length,
                decoded.sampleRate
            );


        const source =
            off.createBufferSource();

        source.buffer = decoded;


        const chain =
            createChain(off, preset);


        source
            .connect(chain.in);

        chain.out
            .connect(off.destination);


        source.start();


        let timer = setInterval(() => {

            let n =
                parseInt($('#percent').textContent) || 20;

            if (n < 78) {

                setProgress(
                    n + 1,
                    'Processando áudio...'
                );

            }

        }, 100);


        const rendered =
            await off.startRendering();


        clearInterval(timer);


        setProgress(
            82,
            'Convertendo para MP3...'
        );


        const blob =
            encode(
                rendered,
                p =>
                    setProgress(
                        82 + Math.round(p * 17),
                        'Convertendo para MP3...'
                    )
            );


        setProgress(
            100,
            'Concluído.'
        );


        if (resultURL) {

            URL.revokeObjectURL(resultURL);

        }


        resultURL =
            URL.createObjectURL(blob);


        output.src = resultURL;


        const name =
            selected.name.replace(
                /\.[^/.]+$/,
                ''
            ) + '_bassbooster_rS.mp3';


        const a =
            $('#download');


        a.href = resultURL;

        a.download = name;


        $('#downloadName').textContent =
            name;


        result.classList.remove('hidden');


        result.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });


    } catch (e) {

        console.error(e);

        alert(
            'Não foi possível processar este áudio. ' +
            'Tente outro arquivo.'
        );


    } finally {

        process.disabled = false;

        process.textContent =
            '⚡ PROCESSAR ÁUDIO';

    }

};


/* ===============================
   CADEIA DE PROCESSAMENTO
================================ */

function createChain(c, p) {

    const input =
        c.createGain();


    const out =
        c.createGain();


    /*
     * FILTROS
     */

    const sub30 =
        c.createBiquadFilter();


    const low =
        c.createBiquadFilter();


    const bass60 =
        c.createBiquadFilter();


    const mid =
        c.createBiquadFilter();


    const body =
        c.createBiquadFilter();


    const lowMid =
        c.createBiquadFilter();


    const voice =
        c.createBiquadFilter();


    const presence =
        c.createBiquadFilter();


    /*
     * DINÂMICA
     */

    const comp =
        c.createDynamicsCompressor();


    const make =
        c.createGain();


    const lim =
        c.createDynamicsCompressor();


    /* ===============================
       V2
    ================================= */

    if (p === 'v2') {

        low.type = 'lowshelf';

        low.frequency.value = 45;

        low.gain.value = 11;


        mid.type = 'peaking';

        mid.frequency.value = 85;

        mid.Q.value = 0.9;

        mid.gain.value = 7;


        body.type = 'peaking';

        body.frequency.value = 115;

        body.Q.value = 0.85;

        body.gain.value = 2;

    }


    /* ===============================
       V3
    ================================= */

    if (p === 'v3') {

        low.type = 'lowshelf';

        low.frequency.value = 45;

        low.gain.value = 12;


        mid.type = 'peaking';

        mid.frequency.value = 75;

        mid.Q.value = 0.9;

        mid.gain.value = 8.5;


        body.type = 'peaking';

        body.frequency.value = 115;

        body.Q.value = 0.85;

        body.gain.value = 3;


        voice.type = 'peaking';

        voice.frequency.value = 3200;

        voice.Q.value = 1;

        voice.gain.value = -1.8;

    }


    /* ===============================
       V4
       BASEADA NA REFERÊNCIA
    ================================= */

    if (p === 'v4') {

        /*
         * SUBGRAVE
         */

        sub30.type = 'peaking';

        sub30.frequency.value = 30;

        sub30.Q.value = 0.75;

        sub30.gain.value = 8;


        /*
         * GRAVE PRINCIPAL
         */

        low.type = 'lowshelf';

        low.frequency.value = 45;

        low.gain.value = 13;


        /*
         * IMPACTO 60 Hz
         */

        bass60.type = 'peaking';

        bass60.frequency.value = 60;

        bass60.Q.value = 0.8;

        bass60.gain.value = 10;


        /*
         * 80 Hz
         */

        mid.type = 'peaking';

        mid.frequency.value = 80;

        mid.Q.value = 0.85;

        mid.gain.value = 8;


        /*
         * 110 Hz
         */

        body.type = 'peaking';

        body.frequency.value = 110;

        body.Q.value = 0.85;

        body.gain.value = 5;


        /*
         * 150 Hz
         */

        lowMid.type = 'peaking';

        lowMid.frequency.value = 150;

        lowMid.Q.value = 0.8;

        lowMid.gain.value = 1;


        /*
         * 220 Hz
         */

        voice.type = 'peaking';

        voice.frequency.value = 220;

        voice.Q.value = 0.9;

        voice.gain.value = -2;


        /*
         * 350 Hz
         */

        presence.type = 'peaking';

        presence.frequency.value = 350;

        presence.Q.value = 0.9;

        presence.gain.value = -3;

    }


    /*
     * FILTRO DE VOZ / MÉDIOS
     */

    if (p !== 'v4') {

        voice.type = 'peaking';

        voice.frequency.value = 3200;

        voice.Q.value = 1;

        voice.gain.value =
            p === 'v3'
                ? -1.8
                : 0;

    }


    /*
     * COMPRESSOR
     */

    comp.threshold.value =
        p === 'v4'
            ? -19
            : -18.4;


    comp.ratio.value =
        p === 'v4'
            ? 2.8
            : 2.6;


    comp.attack.value =
        0.008;


    comp.release.value =
        0.12;


    comp.knee.value =
        10;


    /*
     * MAKEUP
     */

    make.gain.value =
        p === 'v4'
            ? 1.02
            : 1.08;


    /*
     * LIMITER
     */

    lim.threshold.value =
        p === 'v4'
            ? -0.9
            : -0.8;


    lim.ratio.value = 20;

    lim.attack.value = 0.005;

    lim.release.value = 0.08;


    /*
     * CONEXÃO
     */

    if (p === 'v4') {

        input
            .connect(sub30)
            .connect(low)
            .connect(bass60)
            .connect(mid)
            .connect(body)
            .connect(lowMid)
            .connect(voice)
            .connect(presence)
            .connect(comp)
            .connect(make)
            .connect(lim)
            .connect(out);

    } else {

        input
            .connect(low)
            .connect(mid)
            .connect(body)
            .connect(voice)
            .connect(comp)
            .connect(make)
            .connect(lim)
            .connect(out);

    }


    return {
        in: input,
        out: out
    };

}


/* ===============================
   MP3 ENCODER
================================ */

function encode(b, cb) {

    if (typeof lamejs === 'undefined') {

        throw Error(
            'lamejs não carregado'
        );

    }


    const ch =
        Math.min(
            2,
            b.numberOfChannels
        );


    const enc =
        new lamejs.Mp3Encoder(
            ch,
            b.sampleRate,
            320
        );


    const block =
        1152;


    const left =
        b.getChannelData(0);


    const right =
        ch > 1
            ? b.getChannelData(1)
            : null;


    const data = [];


    for (
        let i = 0;
        i < left.length;
        i += block
    ) {

        const end =
            Math.min(
                i + block,
                left.length
            );


        const l =
            to16(
                left.subarray(i, end)
            );


        let m;


        if (ch === 2) {

            const r =
                to16(
                    right.subarray(i, end)
                );


            m =
                enc.encodeBuffer(
                    l,
                    r
                );

        } else {

            m =
                enc.encodeBuffer(l);

        }


        if (m.length) {

            data.push(
                new Int8Array(m)
            );

        }


        if (cb) {

            cb(
                Math.min(
                    1,
                    end / left.length
                )
            );

        }

    }


    const end =
        enc.flush();


    if (end.length) {

        data.push(
            new Int8Array(end)
        );

    }


    return new Blob(
        data,
        {
            type: 'audio/mpeg'
        }
    );

}


/* ===============================
   FLOAT → INT16
================================ */

function to16(a) {

    const o =
        new Int16Array(
            a.length
        );


    for (
        let i = 0;
        i < a.length;
        i++
    ) {

        const x =
            Math.max(
                -1,
                Math.min(
                    1,
                    a[i]
                )
            );


        o[i] =
            x < 0
                ? x * 32768
                : x * 32767;

    }


    return o;

}


/* ===============================
   PROGRESSO
================================ */

function setProgress(n, t) {

    $('#bar').style.width =
        n + '%';


    $('#percent').textContent =
        Math.round(n) + '%';


    $('#progressText').textContent =
        t;

}
