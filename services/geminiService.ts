
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Song, SongSectionType, SongGenre } from "../types";
import { getAudioContext } from "./audioEngine";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Text Generation (Lyrics & Chords) ---

export const generateSong = async (
  promptOrLyrics: string, 
  styles: string, 
  genre: SongGenre,
  useProvidedLyrics: boolean = false
): Promise<Song> => {
  const model = "gemini-3-pro-preview";

  const systemInstruction = `You are a world-class music producer. 
  Output ONLY valid JSON. Do not include image data or base64.
  Style Direction: ${styles}
  Primary Genre: ${genre}
  
  Musical Guidelines:
  - If R&B: Use complex chords (maj9, m11).
  - If Pop: Simple catchy progressions.
  - If Chinese Style: Pentatonic movements.
  - Keep the description short (max 20 words).
  `;

  const userPrompt = useProvidedLyrics 
    ? `Compose the structure and chords for these lyrics: "${promptOrLyrics}". Style: ${styles}.`
    : `Write a ${genre} song about: ${promptOrLyrics}. Musical Style: ${styles}.`;

  const response = await ai.models.generateContent({
    model,
    contents: userPrompt,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingBudget: 4000 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          song: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              artistStyle: { type: Type.STRING },
              tempo: { type: Type.STRING },
              key: { type: Type.STRING },
              description: { type: Type.STRING },
              sections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING, enum: [SongSectionType.VERSE, SongSectionType.CHORUS, SongSectionType.BRIDGE, SongSectionType.OUTRO] },
                    lyrics: { type: Type.ARRAY, items: { type: Type.STRING } },
                    chords: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const text = response.text || "{}";
  try {
    const json = JSON.parse(text);
    if (!json.song) throw new Error("Missing song data");
    
    // Defensive check for sections and lyrics
    if (!json.song.sections || !Array.isArray(json.song.sections)) {
      json.song.sections = [];
    } else {
      json.song.sections = json.song.sections.map((s: any) => ({
        ...s,
        lyrics: Array.isArray(s.lyrics) ? s.lyrics : [],
        chords: Array.isArray(s.chords) ? s.chords : []
      }));
    }

    json.song.genre = genre;
    return json.song;
  } catch (e) {
    console.error("Raw AI Response:", text);
    throw new Error("The AI returned an invalid music structure. Please try again.");
  }
};

export const expandLyrics = async (initialPrompt: string): Promise<string> => {
    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Expand this song idea into professional lyrics (2 verses, 1 chorus): ${initialPrompt}`
    });
    return response.text || "";
};

// --- Image Generation (Album Art) ---

export const generateAlbumArt = async (title: string, description: string, genre: string): Promise<string | undefined> => {
  try {
    const prompt = `Album cover: "${title}". Style: ${genre}. Vibe: ${description}. Digital art, high quality.`;
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: prompt }] },
      config: { imageConfig: { aspectRatio: "1:1" } },
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
    return undefined;
  } catch (error) {
    return undefined;
  }
};

// --- TTS Audio Generation ---

function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
  }
  return buffer;
}

export const generateTTSAudio = async (text: string, genre: SongGenre): Promise<AudioBuffer> => {
  const model = "gemini-2.5-flash-preview-tts";
  let voiceName = "Kore";
  if (genre === 'pop') voiceName = "Fenrir";
  else if (genre === 'country') voiceName = "Zephyr";
  else if (genre === 'chinese') voiceName = "Puck";

  const response = await ai.models.generateContent({
    model,
    contents: [{ parts: [{ text: `Sing smoothly: \n${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts.find(p => p.inlineData)?.inlineData?.data;
  if (!base64Audio) throw new Error("Playback Error: No audio data returned");
  return await decodeAudioData(decode(base64Audio), getAudioContext(), 24000, 1);
};
