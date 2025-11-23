import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Song, SongSectionType, SongGenre } from "../types";
import { getAudioContext } from "./audioEngine";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Text Generation (Lyrics & Chords) ---

export const generateSong = async (theme: string, mood: string, genre: SongGenre): Promise<Song> => {
  const model = "gemini-2.5-flash";

  let genreInstruction = "";
  if (genre === 'rnb') {
    genreInstruction = "Style: Soulful R&B similar to 'Hate To Let You Go'. Use rich chords (maj7, m9, dim7, 11). Tempo around 80-90 BPM.";
  } else if (genre === 'pop') {
    genreInstruction = "Style: Modern Pop. Catchy, repetitive, upbeat. Use simple, effective triad chords (I-V-vi-IV progressions). Tempo around 110-128 BPM. Lyrics should be conversational and hooky.";
  } else if (genre === 'country') {
    genreInstruction = "Style: Country Folk. Acoustic, warm, storytelling. Use standard open chords (G, C, D, Em, Am). Tempo around 70-100 BPM. Lyrics should focus on imagery, home, nature, or heartbreak.";
  } else if (genre === 'chinese') {
    genreInstruction = "Style: Chinese Traditional/Gufeng (Ancient Style). Poetic, elegant, using imagery of nature, moonlight, and longing. Use chords that imply pentatonic scales (add9, sus2, maj7, min7). Tempo around 60-80 BPM.";
  }

  const prompt = `Create a song. 
  ${genreInstruction}
  Topic: ${theme}.
  Mood: ${mood}.
  
  Provide a creative title, tempo, musical key, and a short description.
  Break down the song into sections (Verse, Chorus, Bridge, etc.).
  For each section, provide lines of lyrics and the chords that go with them.
  Ensure chords are placed correctly for the lines.
  
  Output must be JSON matching the schema.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
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
              genre: { type: Type.STRING, enum: ['rnb', 'pop', 'country', 'chinese'] },
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

  const json = JSON.parse(response.text || "{}");
  // Enforce genre if model missed it, or just pass it through
  json.song.genre = genre;
  return json.song;
};

// --- Image Generation (Album Art) ---

export const generateAlbumArt = async (title: string, description: string, genre: string): Promise<string | undefined> => {
  try {
    const prompt = `Album cover art for a ${genre} song titled "${title}". 
    Description: ${description}. 
    High quality, artistic, 4k, digital art, atmospheric lighting. 
    ${genre === 'chinese' ? 'Ink wash painting style, elegant, nature' : ''}
    ${genre === 'rnb' ? 'Neon lights, moody, soulful, dark background' : ''}
    ${genre === 'pop' ? 'Vibrant, colorful, abstract geometric shapes' : ''}
    ${genre === 'country' ? 'Vintage texture, acoustic guitar, sunset, fields' : ''}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
        },
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    return undefined;
  } catch (error) {
    console.error("Album art generation failed:", error);
    return undefined; // Fail gracefully
  }
};

// --- TTS Audio Generation ---

// Helper to decode Base64
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper to decode Audio Data
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const generateTTSAudio = async (text: string, genre: SongGenre): Promise<AudioBuffer> => {
  const model = "gemini-2.5-flash-preview-tts";
  
  let instruction = "";
  let voiceName = "Kore";

  if (genre === 'rnb') {
    instruction = "Perform these lyrics as a soulful R&B spoken word, emotional and smooth. Use pauses for effect.";
    voiceName = "Kore";
  } else if (genre === 'pop') {
    instruction = "Perform these lyrics with an upbeat, energetic pop delivery. Speak clearly and rhythmically.";
    voiceName = "Fenrir"; 
  } else if (genre === 'country') {
    instruction = "Perform these lyrics with a warm, storytelling folk style. Calm and sincere.";
    voiceName = "Zephyr"; 
  } else if (genre === 'chinese') {
    instruction = "Perform these lyrics with a gentle, poetic, and slightly dramatic recitation style.";
    voiceName = "Puck"; 
  }

  const response = await ai.models.generateContent({
    model,
    contents: [{ parts: [{ text: `${instruction} Lyrics: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

  if (!base64Audio) {
    throw new Error("No audio data returned");
  }

  const audioCtx = getAudioContext();
  
  return await decodeAudioData(
    decode(base64Audio),
    audioCtx,
    24000,
    1,
  );
};