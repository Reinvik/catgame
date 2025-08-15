
import { useCallback, useRef, useState, useEffect } from 'react';

type SoundType = 'start' | 'collect' | 'hide' | 'capture' | 'levelComplete' | 'gameOver' | 'respawn';

// --- INSTRUCCIONES PARA MÚSICA PERSONALIZADA ---
// 1. El enlace que proporcionaste de Suno es una página web, no un enlace directo a un archivo de audio.
// 2. Necesitas DESCARGAR el archivo de audio (normalmente como .mp3) desde Suno.
// 3. Sube ese archivo .mp3 a un servicio de hosting (como GitHub Pages, Vercel, Netlify, etc.).
// 4. Pega el enlace PÚBLICO y DIRECTO a tu archivo .mp3 aquí abajo, reemplazando la URL de ejemplo.
const MUSIC_URL = 'https://files.catbox.moe/ie86q4.mp3';


export const useAudio = () => {
    const [isMuted, setIsMuted] = useState(false);
    
    // Sistema para efectos de sonido (SFX) usando Web Audio API para baja latencia
    const sfxAudioCtxRef = useRef<AudioContext | null>(null);
    const sfxMasterGainRef = useRef<GainNode | null>(null);

    // Sistema para música de fondo usando un elemento <audio> de HTML para máxima compatibilidad
    const musicAudioElementRef = useRef<HTMLAudioElement | null>(null);

    const isInitializedRef = useRef(false);

    // Inicialización única de los sistemas de audio
    useEffect(() => {
        if (isInitializedRef.current || typeof window === 'undefined') return;

        // 1. Inicializar el reproductor de música
        const audio = new Audio(MUSIC_URL);
        audio.crossOrigin = "anonymous";
        audio.loop = true;
        audio.volume = 0.4; // Volumen inicial para la música
        musicAudioElementRef.current = audio;
        
        // 2. Inicializar el contexto de audio para SFX
        try {
            const context = new (window.AudioContext || (window as any).webkitAudioContext)();
            const masterGain = context.createGain();
            masterGain.connect(context.destination);
            sfxAudioCtxRef.current = context;
            sfxMasterGainRef.current = masterGain;
        } catch (e) {
            console.error("Web Audio API no es compatible en este navegador.", e);
        }

        isInitializedRef.current = true;
    }, []);

    // Efecto para controlar el estado de silencio en ambos sistemas
    useEffect(() => {
        // Silenciar/desilenciar música
        const musicEl = musicAudioElementRef.current;
        if (musicEl) {
            musicEl.muted = isMuted;
        }

        // Silenciar/desilenciar SFX
        const sfxGain = sfxMasterGainRef.current;
        const sfxCtx = sfxAudioCtxRef.current;
        if (sfxGain && sfxCtx) {
            const newVolume = isMuted ? 0 : 1;
            sfxGain.gain.linearRampToValueAtTime(newVolume, sfxCtx.currentTime + 0.1);
        }
    }, [isMuted]);

    const playNote = useCallback((
        frequency: number,
        startTime: number,
        duration: number,
        type: OscillatorType = 'triangle',
        volume = 0.2
    ) => {
        const ctx = sfxAudioCtxRef.current;
        const gain = sfxMasterGainRef.current;
        if (!ctx || !gain) return;

        const oscillator = ctx.createOscillator();
        const noteGain = ctx.createGain();

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, startTime);
        noteGain.gain.setValueAtTime(volume, startTime);
        noteGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        
        oscillator.connect(noteGain);
        noteGain.connect(gain);
        
        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
    }, []);

    const playSound = useCallback((type: SoundType) => {
        const ctx = sfxAudioCtxRef.current;
        if (!ctx) return;
        
        // El navegador requiere una interacción del usuario para iniciar el audio.
        if (ctx.state === 'suspended') {
            ctx.resume();
        }
        
        const now = ctx.currentTime;

        switch(type) {
            case 'start':
                playNote(440, now, 0.1, 'sine', 0.5);
                playNote(523, now + 0.1, 0.1, 'sine', 0.5);
                break;
            case 'collect':
                playNote(880, now, 0.15, 'triangle', 0.4);
                break;
            case 'hide':
                 const gain = sfxMasterGainRef.current;
                if (!gain) return;
                const bufferSize = ctx.sampleRate * 0.2;
                const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    data[i] = Math.random() * 2 - 1;
                }
                const noiseSource = ctx.createBufferSource();
                noiseSource.buffer = buffer;
                const noiseGain = ctx.createGain();
                noiseGain.gain.setValueAtTime(0.3, now);
                noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
                noiseSource.connect(noiseGain);
                noiseGain.connect(gain);
                noiseSource.start(now);
                break;
            case 'capture':
                playNote(300, now, 0.4, 'sawtooth', 0.5);
                playNote(250, now + 0.05, 0.3, 'sawtooth', 0.5);
                break;
            case 'levelComplete':
                playNote(523, now, 0.1, 'sine');
                playNote(659, now + 0.12, 0.1, 'sine');
                playNote(783, now + 0.24, 0.1, 'sine');
                playNote(1046, now + 0.36, 0.2, 'sine', 0.5);
                break;
            case 'gameOver':
                playNote(440, now, 0.2, 'square');
                playNote(349, now + 0.25, 0.2, 'square');
                playNote(261, now + 0.5, 0.4, 'square');
                break;
            case 'respawn':
                playNote(659, now, 0.1, 'triangle', 0.4);
                playNote(880, now + 0.15, 0.2, 'triangle', 0.4);
                break;
        }
    }, [playNote]);
    
    const playMusic = useCallback(() => {
        // Se asegura de que el contexto de audio (para SFX) también se active
        const sfxCtx = sfxAudioCtxRef.current;
        if (sfxCtx && sfxCtx.state === 'suspended') {
            sfxCtx.resume();
        }
        
        // Reproduce la música
        const audio = musicAudioElementRef.current;
        if (audio) {
            audio.play().catch(e => console.error("Error al reproducir música. El navegador requiere interacción del usuario.", e));
        }
    }, []);

    const stopMusic = useCallback(() => {
        const audio = musicAudioElementRef.current;
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }
    }, []);

    const toggleMute = useCallback(() => {
        setIsMuted(prev => !prev);
    }, []);

    return { playSound, playMusic, stopMusic, isMuted, toggleMute };
};
