export enum SongSectionType {
  VERSE = 'Verse',
  CHORUS = 'Chorus',
  BRIDGE = 'Bridge',
  OUTRO = 'Outro'
}

export type SongGenre = 'rnb' | 'pop' | 'country' | 'chinese';

export interface SongSection {
  type: SongSectionType;
  lyrics: string[];
  chords: string[]; // Corresponding chords for the lines
}

export interface Song {
  title: string;
  genre: SongGenre;
  artistStyle: string;
  tempo: string;
  key: string;
  description: string;
  coverArt?: string; // Base64 image data
  sections: SongSection[];
}

export interface SongGenerationResponse {
  song: Song;
}