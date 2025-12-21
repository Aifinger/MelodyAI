
import { Song, SongGenre, SongSectionType } from '../types';

const NOTES: Record<string, number> = {
  'Cb': 246.94, 'C': 261.63, 'C#': 277.18, 'Db': 277.18,
  'D': 293.66, 'D#': 311.13, 'Eb': 311.13,
  'E': 329.63, 'E#': 349.23,
  'F': 349.23, 'F#': 369.99, 'Gb': 369.99,
  'G': 392.00, 'G#': 415.30, 'Ab': 415.30,
  'A': 440.00, 'A#': 466.16, 'Bb': 466.16,
  'B': 493.88, 'B#': 523.25
};

const CHORD_SHAPES: Record<string, number[]> = {
  'maj': [0, 4, 7], 'min': [0, 3, 7], 'm': [0, 3, 7], 'dim': [0, 3, 6],
  '7': [0, 4, 7, 10], 'maj7': [0, 4, 7, 11], 'm7': [0, 3, 7, 10],
  '9': [0, 4, 7, 10, 14], 'add9': [0, 4, 7, 14], 'sus4': [0, 5, 7], 'sus2': [0, 2, 7]
};

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let masterCompressor: DynamicsCompressorNode | null = null;
let musicBus: GainNode | null = null; 
let reverbNode: ConvolverNode | null = null;
let activeNodes: AudioNode[] = [];
let noiseBuffer: AudioBuffer | null = null;

export const getAudioContext = () => {
  if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return audioCtx;
};

const createImpulseResponse = (ctx: BaseAudioContext, duration: number, decay: number) => {
    const rate = ctx.sampleRate;
    const length = rate * duration;
    const impulse = ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);
    for (let i = 0; i < length; i++) {
        const n = i / length;
        const noise = (Math.random() * 2 - 1) * Math.pow(1 - n, decay);
        left[i] = noise; right[i] = noise;
    }
    return impulse;
};

// Helper for both real-time and offline routing
const setupRouting = (ctx: BaseAudioContext) => {
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 30;
    compressor.ratio.value = 10;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = "lowshelf";
    lowShelf.frequency.value = 100;
    lowShelf.gain.value = 3;

    const highShelf = ctx.createBiquadFilter();
    highShelf.type = "highshelf";
    highShelf.frequency.value = 10000;
    highShelf.gain.value = 2;

    const mBus = ctx.createGain();
    const mGain = ctx.createGain();
    mGain.gain.value = 0.85;
    
    const rNode = ctx.createConvolver();
    rNode.buffer = createImpulseResponse(ctx, 4.0, 3.5);
    const reverbWet = ctx.createGain();
    reverbWet.gain.value = 0.45;

    mBus.connect(lowShelf);
    lowShelf.connect(highShelf);
    highShelf.connect(compressor);
    rNode.connect(reverbWet);
    reverbWet.connect(mBus);
    compressor.connect(mGain);
    mGain.connect(ctx.destination);

    return { masterGain: mGain, reverbNode: rNode, masterCompressor: compressor, musicBus: mBus };
};

const triggerSidechain = (musicBus: GainNode, time: number) => {
    musicBus.gain.setTargetAtTime(0.5, time, 0.01);
    musicBus.gain.setTargetAtTime(1, time + 0.1, 0.1);
};

const playKick = (ctx: BaseAudioContext, time: number, vol = 1.0, dest: AudioNode, musicBus?: GainNode) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.4);
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + 0.4);
    if (musicBus) triggerSidechain(musicBus, time);
    return osc;
};

const playSnare = (ctx: BaseAudioContext, time: number, vol = 0.8, dest: AudioNode, nBuffer: AudioBuffer) => {
    const noise = ctx.createBufferSource();
    noise.buffer = nBuffer;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "highpass";
    noiseFilter.frequency.value = 1200;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(vol, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.25);
    noise.connect(noiseFilter).connect(noiseGain).connect(dest);
    noise.start(time);
    noise.stop(time + 0.25);
    return noise;
};

const createNoiseBuffer = (ctx: BaseAudioContext) => {
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
};

const playHiHat = (ctx: BaseAudioContext, time: number, vol = 0.6, dest: AudioNode, nBuffer: AudioBuffer) => {
    const source = ctx.createBufferSource();
    source.buffer = nBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 9000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * 0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
    source.connect(filter).connect(gain).connect(dest);
    source.start(time);
    source.stop(time + 0.05);
    return source;
};

const playNote = (ctx: BaseAudioContext, freq: number, time: number, duration: number, type: string, dest: AudioNode, vol = 0.1) => {
    const osc = ctx.createOscillator();
    osc.type = type === 'bass' ? 'square' : (type === 'lead' ? 'sawtooth' : 'triangle');
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(gain).connect(dest);
    osc.start(time);
    osc.stop(time + duration);
    return osc;
};

const getChordFrequencies = (chordName: string): number[] => {
  const rootMatch = chordName.match(/^([A-G][#b]?)(.*)$/);
  if (!rootMatch) return [];
  const rootNote = rootMatch[1];
  const quality = rootMatch[2] || 'maj';
  const baseFreq = NOTES[rootNote];
  if (!baseFreq) return [];
  let intervals = CHORD_SHAPES['maj']; 
  for (const key of Object.keys(CHORD_SHAPES).sort((a, b) => b.length - a.length)) {
    if (quality.startsWith(key)) { intervals = CHORD_SHAPES[key]; break; }
  }
  return intervals.map(semitones => baseFreq * Math.pow(2, semitones / 12));
};

// Common rendering logic for real-time and offline
const renderMusicToContext = (ctx: BaseAudioContext, song: Song, vocalBuffer: AudioBuffer | null, musicBus: GainNode, masterCompressor: DynamicsCompressorNode, reverbNode: ConvolverNode, startTime: number) => {
  let cursor = startTime;
  const bpm = parseInt(song.tempo) || 90;
  const barDur = (60/bpm) * 4;
  const nBuffer = createNoiseBuffer(ctx);
  const nodes: AudioNode[] = [];

  if (vocalBuffer) {
    const vocalMainGain = ctx.createGain();
    vocalMainGain.gain.value = 1.1;
    const presenceEQ = ctx.createBiquadFilter();
    presenceEQ.type = "peaking";
    presenceEQ.frequency.value = 4000;
    presenceEQ.gain.value = 5;
    const highCut = ctx.createBiquadFilter();
    highCut.type = "lowpass";
    highCut.frequency.value = 12000;
    const lowCut = ctx.createBiquadFilter();
    lowCut.type = "highpass";
    lowCut.frequency.value = 150;
    const vocalComp = ctx.createDynamicsCompressor();
    vocalComp.threshold.value = -20;
    vocalComp.ratio.value = 4;

    const vocalSource = ctx.createBufferSource();
    vocalSource.buffer = vocalBuffer;
    vocalSource.connect(lowCut);
    lowCut.connect(highCut);
    highCut.connect(presenceEQ);
    presenceEQ.connect(vocalComp);
    vocalComp.connect(vocalMainGain);
    vocalMainGain.connect(masterCompressor);

    const leftDelay = ctx.createDelay(); leftDelay.delayTime.value = 0.025;
    const rightDelay = ctx.createDelay(); rightDelay.delayTime.value = 0.035;
    const panL = ctx.createStereoPanner(); panL.pan.value = -0.6;
    const panR = ctx.createStereoPanner(); panR.pan.value = 0.6;
    const sideGain = ctx.createGain(); sideGain.gain.value = 0.4;

    vocalMainGain.connect(leftDelay).connect(panL).connect(sideGain).connect(reverbNode);
    vocalMainGain.connect(rightDelay).connect(panR).connect(sideGain).connect(reverbNode);

    vocalSource.start(startTime);
    nodes.push(vocalSource);
  }

  song.sections.forEach(section => {
    section.chords.forEach(chordLine => {
        const chords = chordLine.split(/\s+/).filter(x => x.length > 0);
        const dur = barDur / (chords.length || 1);
        chords.forEach(c => {
            const freqs = getChordFrequencies(c);
            if (freqs.length) {
                freqs.forEach(f => nodes.push(playNote(ctx, f, cursor, dur, 'synth', musicBus, 0.15)));
                nodes.push(playNote(ctx, freqs[0]/2, cursor, dur, 'bass', musicBus, 0.4));
                nodes.push(playKick(ctx, cursor, 0.9, masterCompressor, musicBus));
                nodes.push(playSnare(ctx, cursor + (dur/2), 0.7, masterCompressor, nBuffer));
                for(let i=0; i<4; i++) nodes.push(playHiHat(ctx, cursor + (dur/4)*i, 0.3, masterCompressor, nBuffer));
            }
            cursor += dur;
        });
    });
  });

  return { nodes, duration: cursor - startTime };
};

export const playSongDemo = async (song: Song, vocalBuffer: AudioBuffer | null) => {
  stopAudio();
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') await ctx.resume();

  const { masterCompressor, reverbNode, musicBus } = setupRouting(ctx);
  const { nodes, duration } = renderMusicToContext(ctx, song, vocalBuffer, musicBus, masterCompressor, reverbNode, ctx.currentTime + 0.2);
  activeNodes = nodes;

  return { stop: stopAudio, duration };
};

export const stopAudio = () => {
  activeNodes.forEach(node => { try { if (node instanceof AudioBufferSourceNode || node instanceof OscillatorNode) node.stop(); node.disconnect(); } catch (e) { } });
  activeNodes = [];
};

// --- WAV ENCODER HELPER ---
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const outBuffer = new ArrayBuffer(length);
  const view = new DataView(outBuffer);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  function setUint16(data: number) { view.setUint16(pos, data, true); pos += 2; }
  function setUint32(data: number) { view.setUint32(pos, data, true); pos += 4; }

  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8);
  setUint32(0x45564157); // "WAVE"
  setUint32(0x20746d66); // "fmt "
  setUint32(16);
  setUint16(1); // PCM 
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);
  setUint32(0x61746164); // "data"
  setUint32(length - pos - 4);

  for (i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));
  while (pos < length) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF);
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }
  return new Blob([outBuffer], { type: "audio/wav" });
}

export const renderSongToBlob = async (song: Song, vocalBuffer: AudioBuffer | null): Promise<Blob> => {
  const bpm = parseInt(song.tempo) || 90;
  const barDur = (60/bpm) * 4;
  let totalChords = 0;
  song.sections.forEach(s => s.chords.forEach(cl => totalChords += cl.split(/\s+/).filter(x => x.length > 0).length));
  
  // Extra tail for reverb
  const totalDuration = (totalChords * (barDur / 4)) + 5; 
  const sampleRate = 44100;
  const offlineCtx = new OfflineAudioContext(2, Math.ceil(sampleRate * totalDuration), sampleRate);

  const { masterCompressor, reverbNode, musicBus } = setupRouting(offlineCtx);
  renderMusicToContext(offlineCtx, song, vocalBuffer, musicBus, masterCompressor, reverbNode, 0);

  const renderedBuffer = await offlineCtx.startRendering();
  return audioBufferToWav(renderedBuffer);
};
