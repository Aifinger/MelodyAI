import React, { useState, useCallback } from 'react';
import { generateSong, generateTTSAudio, generateAlbumArt } from './services/geminiService';
import { playSongDemo, stopAudio } from './services/audioEngine';
import { Song, SongGenre } from './types';
import { SongCard } from './components/SongCard';
import { Sparkles, Disc, Mic2, Loader2, Music2, Guitar, Radio, Fan } from 'lucide-react';

const PRESET_THEMES = [
  { label: "Summer Love", value: "Falling in love during a warm summer vacation." },
  { label: "Moving On", value: "Packing up boxes and leaving a small town for the big city." },
  { label: "Night Drive", value: "Driving through neon city lights at midnight." },
  { label: "Inner Strength", value: "Overcoming doubt and finding power within." },
];

const GENRES: { id: SongGenre; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'rnb', label: 'R&B Soul', icon: <Disc className="w-4 h-4" />, color: 'from-indigo-500 to-purple-500' },
  { id: 'pop', label: 'Modern Pop', icon: <Radio className="w-4 h-4" />, color: 'from-pink-500 to-rose-500' },
  { id: 'country', label: 'Country Folk', icon: <Guitar className="w-4 h-4" />, color: 'from-amber-500 to-orange-600' },
  { id: 'chinese', label: 'Chinese Style', icon: <Fan className="w-4 h-4" />, color: 'from-emerald-500 to-teal-600' },
];

export default function App() {
  const [theme, setTheme] = useState(PRESET_THEMES[0].value);
  const [customTheme, setCustomTheme] = useState("");
  const [genre, setGenre] = useState<SongGenre>('rnb');
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>("");
  
  // Audio State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (isPlaying) {
        stopAudio();
        setIsPlaying(false);
    }
    setLoading(true);
    setSong(null);
    setLoadingStep("Writing lyrics & composing music...");

    try {
      const finalTheme = customTheme.trim() || theme;
      
      // Step 1: Generate Song Structure
      const generatedSong = await generateSong(finalTheme, "Emotional and Creative", genre);
      
      setLoadingStep("Designing album artwork...");
      
      // Step 2: Generate Album Art (Parallel if we wanted, but sequential is safer for context)
      // Actually let's just display the song first if art takes too long? 
      // No, for the 'Suno' feel, we want the reveal.
      const artUrl = await generateAlbumArt(generatedSong.title, generatedSong.description, genre);
      if (artUrl) generatedSong.coverArt = artUrl;

      setSong(generatedSong);
    } catch (error) {
      console.error("Failed to generate song:", error);
      alert("Something went wrong while composing. Please try again.");
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  }, [theme, customTheme, genre, isPlaying]);

  const handlePlaySong = useCallback(async (lyrics: string) => {
    if (!song) return;
    
    setIsLoadingAudio(true);
    try {
      const vocalBuffer = await generateTTSAudio(lyrics, song.genre);
      
      setIsLoadingAudio(false);
      setIsPlaying(true);
      
      await playSongDemo(song, vocalBuffer);
      
    } catch (error) {
      console.error("Playback Error:", error);
      alert("Could not generate audio. Please check your connection.");
      setIsLoadingAudio(false);
      setIsPlaying(false);
    }
  }, [song]);

  const handleStop = useCallback(() => {
    stopAudio();
    setIsPlaying(false);
  }, []);

  const activeGenreColor = GENRES.find(g => g.id === genre)?.color || 'from-indigo-500 to-purple-500';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-indigo-500/30 font-sans">
      
      {/* Background Decor */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className={`absolute -top-1/4 -left-1/4 w-1/2 h-1/2 rounded-full blur-[120px] opacity-10 bg-gradient-to-br ${activeGenreColor} transition-all duration-1000`}></div>
        <div className={`absolute bottom-0 right-0 w-1/2 h-1/2 rounded-full blur-[120px] opacity-10 bg-gradient-to-tl ${activeGenreColor} transition-all duration-1000`}></div>
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8 md:py-12">
        
        {/* Header */}
        <header className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-3">
             <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${activeGenreColor} flex items-center justify-center shadow-lg shadow-indigo-500/20`}>
                <Music2 className="w-6 h-6 text-white" />
             </div>
             <h1 className="text-2xl font-bold text-white tracking-tight">MelodyAI</h1>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
             <a href="#" className="hover:text-white transition-colors">Discover</a>
             <a href="#" className="hover:text-white transition-colors">Library</a>
             <div className="w-px h-4 bg-slate-800"></div>
             <a href="#" className="hover:text-white transition-colors">Sign In</a>
          </div>
        </header>

        {/* Generator Section */}
        {!song && !loading ? (
           <div className="max-w-3xl mx-auto my-12 md:my-20 text-center space-y-12 animate-fade-in-up">
              
              <div className="space-y-4">
                <h2 className="text-5xl md:text-6xl font-bold text-white tracking-tight">
                  Make music, <br/>
                  <span className={`text-transparent bg-clip-text bg-gradient-to-r ${activeGenreColor}`}>instantly.</span>
                </h2>
                <p className="text-slate-400 text-lg max-w-xl mx-auto">
                  Generate lyrics, chords, and album art with the power of Gemini 2.5.
                </p>
              </div>

              <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl space-y-8 text-left">
                
                {/* Custom Input */}
                <div className="relative group">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1 mb-2 block">Song Description</label>
                  <textarea
                    placeholder="A song about a robot who falls in love with a coffee machine..."
                    value={customTheme}
                    onChange={(e) => setCustomTheme(e.target.value)}
                    rows={2}
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-5 py-4 text-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all resize-none"
                  />
                  <div className="absolute right-4 bottom-4 text-slate-600 pointer-events-none">
                      <Sparkles className="w-5 h-5" />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-8">
                   {/* Genre Selection */}
                   <div className="space-y-3">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Style</label>
                      <div className="grid grid-cols-2 gap-2">
                        {GENRES.map((g) => (
                          <button
                            key={g.id}
                            onClick={() => setGenre(g.id)}
                            className={`
                              flex items-center gap-2 px-3 py-3 rounded-xl border text-sm font-medium transition-all
                              ${genre === g.id 
                                ? 'bg-slate-800 border-indigo-500/50 text-white' 
                                : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-800'
                              }
                            `}
                          >
                            <span className={genre === g.id ? 'text-indigo-400' : 'text-slate-500'}>{g.icon}</span>
                            {g.label}
                          </button>
                        ))}
                      </div>
                   </div>

                   {/* Quick Prompts */}
                   <div className="space-y-3">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Quick Ideas</label>
                      <div className="flex flex-wrap gap-2">
                        {PRESET_THEMES.map((t) => (
                          <button
                            key={t.label}
                            onClick={() => { setTheme(t.value); setCustomTheme(t.value); }}
                            className="px-3 py-2 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                   </div>
                </div>

                {/* Generate Button */}
                <button
                  onClick={handleGenerate}
                  className={`
                    w-full font-bold py-5 rounded-xl shadow-lg shadow-indigo-500/20 transition-all transform hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-3 text-lg
                    bg-gradient-to-r ${activeGenreColor} text-white
                  `}
                >
                  <Disc className="w-6 h-6" />
                  Create
                </button>
              </div>

           </div>
        ) : null}

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] animate-in fade-in duration-500">
             <div className="relative mb-8">
                <div className={`absolute inset-0 bg-gradient-to-r ${activeGenreColor} blur-xl opacity-50 rounded-full animate-pulse`}></div>
                <div className="relative bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl">
                   <Loader2 className="w-12 h-12 text-white animate-spin" />
                </div>
             </div>
             <h3 className="text-2xl font-bold text-white mb-2">{loadingStep}</h3>
             <p className="text-slate-500">Using Gemini 2.5 Flash...</p>
          </div>
        )}

        {/* Results Area */}
        {!loading && song && (
          <div className="animate-in slide-in-from-bottom-10 fade-in duration-700">
             <div className="mb-8 flex items-center gap-4">
                <button 
                  onClick={() => setSong(null)} 
                  className="text-slate-400 hover:text-white transition-colors text-sm font-medium flex items-center gap-2"
                >
                  ← Create Another
                </button>
             </div>
             
             <SongCard 
                song={song} 
                onPlaySong={handlePlaySong}
                onStop={handleStop}
                isPlaying={isPlaying}
                isLoadingAudio={isLoadingAudio}
              />
          </div>
        )}

      </div>
    </div>
  );
}