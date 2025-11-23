import { Song, SongGenre, SongSectionType } from '../types';

// Frequency map for notes
const NOTES: Record<string, number> = {
  'Cb': 246.94, 'C': 261.63, 'C#': 277.18, 'Db': 277.18,
  'D': 293.66, 'D#': 311.13, 'Eb': 311.13,
  'E': 329.63, 'E#': 349.23,
  'F': 349.23, 'F#': 369.99, 'Gb': 369.99,
  'G': 392.00, 'G#': 415.30, 'Ab': 415.30,
  'A': 440.00, 'A#': 466.16, 'Bb': 466.16,
  'B': 493.88, 'B#': 523.25
};

// Chord qualities (semitones from root)
const CHORD_SHAPES: Record<string, number[]> = {
  'maj': [0, 4, 7],
  'min': [0, 3, 7],
  'm': [0, 3, 7],
  'dim': [0, 3, 6],
  'aug': [0, 4, 8],
  '7': [0, 4, 7, 10],
  'maj7': [0, 4, 7, 11],
  'm7': [0, 3, 7, 10],
  '9': [0, 4, 7, 10, 14],
  'maj9': [0, 4, 7, 11, 14],
  'm9': [0, 3, 7, 10, 14],
  'sus4': [0, 5, 7],
  'sus2': [0, 2, 7],
  'add9': [0, 4, 7, 14],
};

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let masterCompressor: DynamicsCompressorNode | null = null;
let musicBus: GainNode | null = null; // Bus for sidechaining
let reverbNode: ConvolverNode | null = null;
let activeNodes: AudioNode[] = [];
let noiseBuffer: AudioBuffer | null = null;

export const getAudioContext = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
};

// --- REVERB & EFFECTS ---

const createImpulseResponse = (ctx: AudioContext, duration: number, decay: number) => {
    const rate = ctx.sampleRate;
    const length = rate * duration;
    const impulse = ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
        const n = i / length;
        // Pink noise with exponential decay, smoothed
        const noise = (Math.random() * 2 - 1) * Math.pow(1 - n, decay);
        left[i] = noise;
        right[i] = noise;
    }
    return impulse;
};

const setupMasterBus = (ctx: AudioContext) => {
    if (masterGain && reverbNode && masterCompressor && musicBus) return { masterGain, reverbNode, masterCompressor, musicBus };

    // 1. Dynamics Compressor (Limit/Glue)
    masterCompressor = ctx.createDynamicsCompressor();
    masterCompressor.threshold.value = -18;
    masterCompressor.knee.value = 30;
    masterCompressor.ratio.value = 12;
    masterCompressor.attack.value = 0.003;
    masterCompressor.release.value = 0.25;

    // 2. Master EQ (Smile Curve for "Produced" Sound)
    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = "lowshelf";
    lowShelf.frequency.value = 80;
    lowShelf.gain.value = 4; // Boost bass

    const highShelf = ctx.createBiquadFilter();
    highShelf.type = "highshelf";
    highShelf.frequency.value = 8000;
    highShelf.gain.value = 4; // Boost treble (air)

    // 3. Music Bus (Sidechain Target)
    musicBus = ctx.createGain();
    
    // 4. Master Gain
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.8;
    
    // 5. Large Hall Reverb
    reverbNode = ctx.createConvolver();
    reverbNode.buffer = createImpulseResponse(ctx, 4.5, 3.0); // Huge decay
    const reverbWet = ctx.createGain();
    reverbWet.gain.value = 0.5; // Very wet mix

    // Routing:
    // Instruments -> MusicBus
    // Reverb -> MusicBus
    // MusicBus -> LowShelf -> HighShelf -> MasterCompressor -> MasterGain -> Out
    
    musicBus.connect(lowShelf);
    lowShelf.connect(highShelf);
    highShelf.connect(masterCompressor);

    reverbNode.connect(reverbWet);
    reverbWet.connect(musicBus); // Reverb gets sidechained too!

    masterCompressor.connect(masterGain);
    masterGain.connect(ctx.destination);

    return { masterGain, reverbNode, masterCompressor, musicBus };
};

const triggerSidechain = (ctx: AudioContext, time: number) => {
    if (!musicBus) return;
    // Duck the volume of the music bus when kick hits
    musicBus.gain.setValueAtTime(1, time);
    musicBus.gain.setTargetAtTime(0.4, time, 0.01); // Fast attack
    musicBus.gain.setTargetAtTime(1, time + 0.1, 0.1); // Release
};

// --- DRUMS & PERCUSSION ---

const createNoiseBuffer = (ctx: AudioContext) => {
    if (noiseBuffer) return noiseBuffer;
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    noiseBuffer = buffer;
    return buffer;
};

const playKick = (ctx: AudioContext, time: number, vol = 1.0, dest: AudioNode) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.4);
    
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
    
    osc.connect(gain);
    gain.connect(dest); // Kick goes to Master (not Sidechained bus)
    
    osc.start(time);
    osc.stop(time + 0.4);
    activeNodes.push(osc, gain);

    // Trigger Sidechain on Music Bus
    triggerSidechain(ctx, time);
};

const playSnare = (ctx: AudioContext, time: number, vol = 0.8, dest: AudioNode) => {
    // Noise
    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx);
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "highpass";
    noiseFilter.frequency.value = 1500;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(vol, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
    
    noise.connect(noiseFilter).connect(noiseGain).connect(dest);
    noise.start(time);
    noise.stop(time + 0.3);
    
    // Body
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(200, time);
    osc.frequency.exponentialRampToValueAtTime(100, time + 0.1);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(vol * 0.5, time);
    oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
    
    osc.connect(oscGain).connect(dest);
    osc.start(time);
    osc.stop(time + 0.15);

    activeNodes.push(noise, noiseGain, osc, oscGain);
};

const playHiHat = (ctx: AudioContext, time: number, vol = 0.6, dest: AudioNode, panVal = 0.3, open = false) => {
    const source = ctx.createBufferSource();
    source.buffer = createNoiseBuffer(ctx);
    
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 8000;
    
    const gain = ctx.createGain();
    const duration = open ? 0.3 : 0.05;
    gain.gain.setValueAtTime(vol * 0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
    
    const panner = ctx.createStereoPanner();
    panner.pan.value = panVal;

    source.connect(filter).connect(gain).connect(panner).connect(dest);
    
    source.start(time);
    source.stop(time + duration);
    activeNodes.push(source, gain, panner);
};

const playCrash = (ctx: AudioContext, time: number, dest: AudioNode) => {
    const source = ctx.createBufferSource();
    source.buffer = createNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 4000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 3.0); // Long decay
    
    const panner = ctx.createStereoPanner();
    panner.pan.value = 0; // Center

    source.connect(filter).connect(gain).connect(panner).connect(dest);
    source.start(time);
    source.stop(time + 3.0);
    activeNodes.push(source, gain, panner);
};

const playWoodblock = (ctx: AudioContext, time: number, dest: AudioNode) => {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(800, time);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.7, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
    
    osc.connect(gain).connect(dest);
    osc.start(time);
    osc.stop(time + 0.1);
    activeNodes.push(osc, gain);
}

// --- SYNTHS & INSTRUMENTS ---

export const stopAudio = () => {
  activeNodes.forEach(node => {
    try {
      if (node instanceof AudioBufferSourceNode) node.stop();
      if (node instanceof OscillatorNode) node.stop();
      node.disconnect();
    } catch (e) { }
  });
  activeNodes = [];
};

const getChordFrequencies = (chordName: string): number[] => {
  const rootMatch = chordName.match(/^([A-G][#b]?)(.*)$/);
  if (!rootMatch) return [];

  const rootNote = rootMatch[1];
  const quality = rootMatch[2] || 'maj';
  const baseFreq = NOTES[rootNote];
  if (!baseFreq) return [];

  let intervals = CHORD_SHAPES['maj']; 
  const qualityKeys = Object.keys(CHORD_SHAPES).sort((a, b) => b.length - a.length);
  for (const key of qualityKeys) {
    if (quality === key || quality.startsWith(key)) {
        intervals = CHORD_SHAPES[key];
        break;
    }
  }
  if (quality === 'm' || quality === 'min') intervals = CHORD_SHAPES['m'];

  return intervals.map(semitones => baseFreq * Math.pow(2, semitones / 12));
};

interface InstrumentConfig {
  type: 'synth' | 'epiano' | 'guitar' | 'piano' | 'guzheng' | 'pad' | 'bass' | 'lead';
  oscillatorType: OscillatorType;
  attack: number;
  decay: number;
  sustainLevel: number;
  release: number;
  strumDelay: number;
}

const INSTRUMENTS: Record<string, InstrumentConfig> = {
  epiano: { type: 'epiano', oscillatorType: 'sine', attack: 0.02, decay: 0.5, sustainLevel: 0.2, release: 0.5, strumDelay: 0.01 },
  synth: { type: 'synth', oscillatorType: 'sawtooth', attack: 0.05, decay: 0.2, sustainLevel: 0.4, release: 0.3, strumDelay: 0 },
  guitar: { type: 'guitar', oscillatorType: 'triangle', attack: 0.01, decay: 0.3, sustainLevel: 0.1, release: 0.3, strumDelay: 0.04 },
  piano: { type: 'piano', oscillatorType: 'sine', attack: 0.01, decay: 0.8, sustainLevel: 0.1, release: 0.8, strumDelay: 0.005 },
  guzheng: { type: 'guzheng', oscillatorType: 'triangle', attack: 0.005, decay: 1.5, sustainLevel: 0, release: 1.5, strumDelay: 0.05 },
  pad: { type: 'pad', oscillatorType: 'sawtooth', attack: 0.5, decay: 1.0, sustainLevel: 0.8, release: 2.0, strumDelay: 0 },
  bass: { type: 'bass', oscillatorType: 'square', attack: 0.02, decay: 0.2, sustainLevel: 0.8, release: 0.2, strumDelay: 0 },
  lead: { type: 'lead', oscillatorType: 'triangle', attack: 0.05, decay: 0.1, sustainLevel: 0.5, release: 0.1, strumDelay: 0 },
};

const playNote = (
    ctx: AudioContext, 
    freq: number, 
    time: number, 
    duration: number, 
    config: InstrumentConfig, 
    dest: AudioNode,
    pan: number = 0,
    vol: number = 0.1
) => {
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(dest);

    const noteGain = ctx.createGain();
    noteGain.connect(panner);
    noteGain.gain.setValueAtTime(vol, time); 

    const envGain = ctx.createGain();
    envGain.connect(noteGain);
    envGain.gain.setValueAtTime(0, time);
    envGain.gain.linearRampToValueAtTime(1, time + config.attack);
    envGain.gain.exponentialRampToValueAtTime(Math.max(0.001, config.sustainLevel), time + config.attack + config.decay);
    envGain.gain.linearRampToValueAtTime(0, time + duration + config.release);

    const osc = ctx.createOscillator();
    osc.type = config.oscillatorType;
    osc.frequency.value = freq;
    
    // Low pass filter
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(config.type === 'bass' ? 600 : 4000, time);
    if(config.type === 'lead') filter.frequency.value = 8000;
    
    osc.connect(filter).connect(envGain);
    
    // Layering for richness
    if (['piano', 'epiano', 'pad', 'guitar'].includes(config.type)) {
        const osc2 = ctx.createOscillator();
        osc2.type = config.type === 'guitar' ? 'sawtooth' : config.oscillatorType; 
        osc2.frequency.value = freq;
        osc2.detune.value = config.type === 'pad' ? 12 : 5; // Detune for chorus effect
        const osc2Gain = ctx.createGain();
        osc2Gain.gain.value = 0.4;
        osc2.connect(osc2Gain).connect(filter);
        osc2.start(time);
        osc2.stop(time + duration + config.release);
        activeNodes.push(osc2, osc2Gain);
    }
    
    if (config.type === 'bass') {
        // Sub oscillator
        const subOsc = ctx.createOscillator();
        subOsc.type = 'sine';
        subOsc.frequency.value = freq / 2;
        const subGain = ctx.createGain();
        subGain.gain.value = 1.2; // Loud sub
        subOsc.connect(subGain).connect(envGain);
        subOsc.start(time);
        subOsc.stop(time + duration + config.release);
        activeNodes.push(subOsc, subGain);
    }

    osc.start(time);
    osc.stop(time + duration + config.release);
    activeNodes.push(osc, envGain, noteGain, panner, filter);
};

// --- ARRANGEMENT ENGINE ---

const playArrangement = (
    ctx: AudioContext, 
    genre: SongGenre, 
    frequencies: number[], 
    startTime: number, 
    duration: number,
    bpm: number,
    musicBus: AudioNode,
    masterBus: AudioNode, // For drums
    reverb: AudioNode,
    sectionType: SongSectionType
) => {
    const beatsInBar = 4;
    const beatDuration = 60 / bpm;
    const barDuration = beatDuration * beatsInBar;
    
    let currentTime = startTime;
    const endTime = startTime + duration;

    // Instruments
    let instConfig = INSTRUMENTS['epiano'];
    let bassConfig = INSTRUMENTS['bass'];
    let padConfig = INSTRUMENTS['pad'];
    let leadConfig = INSTRUMENTS['lead'];

    if (genre === 'pop') instConfig = INSTRUMENTS['synth'];
    if (genre === 'country') instConfig = INSTRUMENTS['guitar'];
    if (genre === 'chinese') instConfig = INSTRUMENTS['guzheng'];

    const rootFreq = frequencies[0] / 2;
    const isChorus = sectionType === SongSectionType.CHORUS;
    const isBridge = sectionType === SongSectionType.BRIDGE;
    const isVerse = sectionType === SongSectionType.VERSE;

    // Intensity Multiplier
    const volMult = isChorus ? 1.0 : (isBridge ? 0.9 : 0.7);

    // Initial Crash for Chorus
    if (isChorus && Math.abs(currentTime - startTime) < 0.1) {
        playCrash(ctx, currentTime, musicBus); // Send crash to reverb/music bus
    }

    while (currentTime < endTime - 0.1) {
        // --- DRUMS (Send to MasterBus or MusicBus depending on sidechain needs) ---
        // We trigger sidechain INSIDE playKick, so Kick goes to MasterBus.
        // Snare/Hats go to MasterBus usually, or MusicBus if we want them ducked. Let's send to MasterBus for clarity.
        
        if (genre === 'pop') {
            // Beat
            playKick(ctx, currentTime, 1.0, masterBus);
            playSnare(ctx, currentTime + beatDuration, 0.9 * volMult, masterBus);
            playKick(ctx, currentTime + beatDuration * 2, 1.0, masterBus);
            playSnare(ctx, currentTime + beatDuration * 3, 0.9 * volMult, masterBus);
            
            // 16th Note Hi-Hats for Chorus
            const hatDiv = isChorus ? 4 : 2; 
            for(let i=0; i< (beatsInBar * hatDiv); i++) {
                const hatTime = currentTime + (beatDuration / hatDiv) * i;
                const isOffBeat = i % 2 !== 0;
                playHiHat(ctx, hatTime, (isOffBeat ? 0.3 : 0.5) * volMult, masterBus, (i%2===0 ? -0.2 : 0.2), isChorus && i % 4 === 2);
            }
            
            // Bass: Driving
            for(let i=0; i<8; i++) playNote(ctx, rootFreq, currentTime + (beatDuration/2)*i, beatDuration/2, bassConfig, musicBus, 0, 0.5 * volMult);

        } else if (genre === 'rnb') {
            playKick(ctx, currentTime, 1.0, masterBus);
            playSnare(ctx, currentTime + beatDuration, 0.8, masterBus);
            playKick(ctx, currentTime + beatDuration * 2.5, 0.9, masterBus);
            
            // Bass: Long Sustain
            playNote(ctx, rootFreq, currentTime, beatDuration * 2, bassConfig, musicBus, 0, 0.6 * volMult);
            playNote(ctx, rootFreq, currentTime + beatDuration * 2.5, beatDuration * 1.5, bassConfig, musicBus, 0, 0.6 * volMult);
            
            // Hats
            for(let i=0; i<8; i++) playHiHat(ctx, currentTime + (beatDuration/2)*i, 0.2 * volMult, masterBus);

        } else if (genre === 'country') {
            playKick(ctx, currentTime, 0.9, masterBus);
            playSnare(ctx, currentTime + beatDuration, 0.8 * volMult, masterBus);
            playKick(ctx, currentTime + beatDuration * 2, 0.9, masterBus);
            playSnare(ctx, currentTime + beatDuration * 3, 0.8 * volMult, masterBus);
            
            // Bass: Root-Five
            playNote(ctx, rootFreq, currentTime, beatDuration, bassConfig, musicBus, 0, 0.5 * volMult);
            playNote(ctx, rootFreq * 1.5, currentTime + beatDuration*2, beatDuration, bassConfig, musicBus, 0, 0.5 * volMult);
        } else if (genre === 'chinese') {
            if (isChorus) playKick(ctx, currentTime, 0.8, masterBus); // Soft kick in chorus
            if (Math.random() > 0.6) playWoodblock(ctx, currentTime + beatDuration * (Math.random()*4), masterBus);
             // Drone Bass
            playNote(ctx, rootFreq, currentTime, barDuration, bassConfig, musicBus, 0, 0.3);
        }

        // --- HARMONY ---
        
        // 1. Chords (Pulsing or Sustained)
        frequencies.forEach((f, i) => {
            const pan = (i % 2 === 0) ? -0.3 : 0.3;
            // Main Chords
            playNote(ctx, f, currentTime, barDuration, instConfig, musicBus, pan, 0.2 * volMult);
            
            // 2. Pad (Always active for atmosphere, huge reverb)
            playNote(ctx, f, currentTime, barDuration, padConfig, reverb, pan * 0.5, 0.1 * volMult);
        });

        // 3. Arpeggiator (Pop Chorus only)
        if (genre === 'pop' && isChorus) {
            for(let i=0; i<16; i++) {
                const noteIndex = i % frequencies.length;
                const noteTime = currentTime + (beatDuration/4) * i;
                // Pluck sound
                playNote(ctx, frequencies[noteIndex] * 2, noteTime, 0.1, leadConfig, musicBus, (i%2===0? -0.4:0.4), 0.15);
            }
        }

        // 4. Country Strumming
        if (genre === 'country') {
             // Already handled by basic chord logic usually, but let's add specific strum
             frequencies.forEach((f, i) => playNote(ctx, f, currentTime + (i*0.03), barDuration/2, instConfig, musicBus, 0.2, 0.2 * volMult));
             frequencies.forEach((f, i) => playNote(ctx, f, currentTime + beatDuration*2 + (i*0.03), barDuration/2, instConfig, musicBus, -0.2, 0.2 * volMult));
        }

        currentTime += barDuration;
    }
};

export const playSongDemo = async (song: Song, vocalBuffer: AudioBuffer | null) => {
  stopAudio();
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') await ctx.resume();

  // Initialize Master Bus
  const { masterCompressor, reverbNode, musicBus } = setupMasterBus(ctx);
  if (!masterCompressor || !reverbNode || !musicBus) return { stop: stopAudio, duration: 0 };

  const startTime = ctx.currentTime + 0.2;
  let cursor = startTime;

  const tempoMatch = song.tempo.match(/(\d+)/);
  const bpm = tempoMatch ? parseInt(tempoMatch[1]) : 100;
  const secondsPerBeat = 60 / bpm;
  const secondsPerBar = secondsPerBeat * 4;

  // 1. Vocals (Process with Doubling + Reverb + Compression)
  if (vocalBuffer) {
    // Lead Vocal (Center)
    const vocalSource = ctx.createBufferSource();
    vocalSource.buffer = vocalBuffer;
    const vocalGain = ctx.createGain();
    vocalGain.gain.value = 0.9; 
    vocalSource.connect(vocalGain).connect(masterCompressor); // Go straight to Master Comp, bypass sidechain
    vocalSource.start(startTime);

    // Vocal Doubles (Wide) - Send to Reverb
    const doubleL = ctx.createBufferSource(); doubleL.buffer = vocalBuffer;
    const doubleR = ctx.createBufferSource(); doubleR.buffer = vocalBuffer;
    
    const panL = ctx.createStereoPanner(); panL.pan.value = -0.4;
    const panR = ctx.createStereoPanner(); panR.pan.value = 0.4;
    
    const doubleGain = ctx.createGain(); doubleGain.gain.value = 0.35;

    doubleL.connect(panL).connect(doubleGain).connect(reverbNode); // Send to reverb
    doubleR.connect(panR).connect(doubleGain).connect(reverbNode);

    doubleL.start(startTime + 0.02); // 20ms delay
    doubleR.start(startTime + 0.03); // 30ms delay

    activeNodes.push(vocalSource, vocalGain, doubleL, doubleR, panL, panR, doubleGain);
  }

  // 2. Music Arrangement
  song.sections.forEach(section => {
    // If no chords generated (rare), fallback
    const chords = section.chords.length > 0 ? section.chords : Array(section.lyrics.length).fill("C");

    chords.forEach((chordLine) => {
        const chordsInLine = chordLine.split(/[\s-]+/).filter(c => c.length > 0);
        const durationPerChord = secondsPerBar / (chordsInLine.length || 1);

        chordsInLine.forEach(chordName => {
            const freqs = getChordFrequencies(chordName);
            if (freqs.length > 0) {
                playArrangement(
                    ctx, 
                    song.genre, 
                    freqs, 
                    cursor, 
                    durationPerChord, 
                    bpm, 
                    musicBus, 
                    masterCompressor, 
                    reverbNode,
                    section.type // Pass section type for dynamics
                );
            }
            cursor += durationPerChord;
        });
    });
  });

  return {
    stop: stopAudio,
    duration: cursor - startTime
  };
};
