import React, { useState, useEffect, useCallback } from 'react';
import { Position, Enemy, EnemyType, GameState, Direction, FoodItem, Rack, EnemyState, HighScoreEntry, PowerUp, PowerUpType, Particle } from './types';
import { BOARD_WIDTH, BOARD_HEIGHT, GRID_SIZE, INITIAL_LIVES, BASE_GAME_TICK, FOOD_PER_LEVEL, FOOD_EMOJIS, ENEMY_BASE_COUNT, HIDING_DURATION_MS, EXIT_EMOJI, WORKER_SPEED, PALLET_JACK_SPEED, WORKER_VISION_RANGE, FREEZE_DURATION_MS, POWERUP_EMOJI, MAX_SPRINT_CHARGES } from './constants';
import Modal from './components/Modal';
import ForkliftIcon from './components/ForkliftIcon';
import { useAudio } from './hooks/useAudio';
import { supabase } from './supabaseClient';

const arePositionsEqual = (pos1: Position, pos2: Position) => pos1.x === pos2.x && pos1.y === pos2.y;

// --- Componente D-Pad para Móviles ---
interface DPadProps {
  onMove: (direction: Direction) => void;
}

const DPad: React.FC<DPadProps> = ({ onMove }) => {
  const dpadRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dpadEl = dpadRef.current;
    if (!dpadEl) return;

    const preventDefault = (e: TouchEvent) => {
      if (e.cancelable) {
        e.preventDefault();
      }
    };

    // Añadir listeners nativos con passive: false para bloquear el overscroll/bounce en iOS/Android
    dpadEl.addEventListener('touchstart', preventDefault, { passive: false });
    dpadEl.addEventListener('touchmove', preventDefault, { passive: false });
    dpadEl.addEventListener('touchend', preventDefault, { passive: false });

    return () => {
      dpadEl.removeEventListener('touchstart', preventDefault);
      dpadEl.removeEventListener('touchmove', preventDefault);
      dpadEl.removeEventListener('touchend', preventDefault);
    };
  }, []);

  const handleTouch = (e: React.TouchEvent, direction: Direction) => {
    e.preventDefault();
    onMove(direction);
  };

  const buttonClasses = "absolute bg-slate-800/40 backdrop-blur-md rounded-full w-12 h-12 sm:w-14 sm:h-14 flex justify-center items-center text-xl sm:text-2xl text-slate-300 border border-slate-700/20 active:bg-yellow-500/60 active:text-slate-900 active:border-yellow-400/40 shadow-md transform active:scale-105 active:shadow-[0_0_12px_rgba(234,179,8,0.4)] transition-all duration-150 select-none touch-none";
  const arrowClasses = "pointer-events-none select-none";

  return (
    <div
      ref={dpadRef}
      className="relative w-40 h-40 select-none mx-auto mt-4 mb-4 landscape:fixed landscape:bottom-6 landscape:left-6 landscape:m-0 landscape:w-40 landscape:h-40 md:fixed md:bottom-8 md:left-8 md:m-0 md:w-44 md:h-44 z-[100] touch-none rounded-full bg-slate-950/20 backdrop-blur-[2px] border border-slate-800/10 shadow-inner"
      aria-label="Controles direccionales"
      role="group"
    >
      <button onTouchStart={(e) => handleTouch(e, 'up')} className={buttonClasses} style={{ top: 0, left: '50%', transform: 'translateX(-50%)' }} aria-label="Mover hacia arriba"><span className={arrowClasses}>▲</span></button>
      <button onTouchStart={(e) => handleTouch(e, 'down')} className={buttonClasses} style={{ bottom: 0, left: '50%', transform: 'translateX(-50%)' }} aria-label="Mover hacia abajo"><span className={arrowClasses}>▼</span></button>
      <button onTouchStart={(e) => handleTouch(e, 'left')} className={buttonClasses} style={{ left: 0, top: '50%', transform: 'translateY(-50%)' }} aria-label="Mover hacia la izquierda"><span className={arrowClasses}>◀</span></button>
      <button onTouchStart={(e) => handleTouch(e, 'right')} className={buttonClasses} style={{ right: 0, top: '50%', transform: 'translateY(-50%)' }} aria-label="Mover hacia la derecha"><span className={arrowClasses}>▶</span></button>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-800/20 border border-slate-700/10 backdrop-blur-[1px] pointer-events-none" />
    </div>
  );
};


const App: React.FC = () => {
    const [gameState, setGameState] = useState<GameState>(GameState.NOT_STARTED);
    const [lives, setLives] = useState<number>(INITIAL_LIVES);
    const [level, setLevel] = useState<number>(1);
    const [playerPosition, setPlayerPosition] = useState<Position>({ x: 1, y: 1 });
    const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
    const [powerUps, setPowerUps] = useState<PowerUp[]>([]);
    const [particles, setParticles] = useState<Particle[]>([]);
    const [enemies, setEnemies] = useState<Enemy[]>([]);
    const [racks, setRacks] = useState<Rack[]>([]);
    const [exitPosition] = useState<Position>({ x: BOARD_WIDTH - 2, y: Math.floor(BOARD_HEIGHT / 2) - 1 });
    const [key, setKey] = useState(0);

    const [isHiding, setIsHiding] = useState<boolean>(false);
    const [hideTimeoutId, setHideTimeoutId] = useState<ReturnType<typeof setTimeout> | null>(null);
    const [allFoodCollected, setAllFoodCollected] = useState<boolean>(false);
    const [gameMessage, setGameMessage] = useState<string | null>(null);
    const [lastKnownPlayerPosition, setLastKnownPlayerPosition] = useState<Position | null>(null);
    const [isCaptureInProgress, setIsCaptureInProgress] = useState<boolean>(false);
    const [capturedPosition, setCapturedPosition] = useState<Position | null>(null);

    const [enemiesFrozen, setEnemiesFrozen] = useState<boolean>(false);
    const [freezeTimeoutId, setFreezeTimeoutId] = useState<ReturnType<typeof setTimeout> | null>(null);

    const [isInvulnerable, setIsInvulnerable] = useState<boolean>(false);
    const [invulnerabilityTimeoutId, setInvulnerabilityTimeoutId] = useState<ReturnType<typeof setTimeout> | null>(null);
    const [isTouchDevice, setIsTouchDevice] = useState<boolean>(false);
    const [isFullscreen, setIsFullscreen] = useState<boolean>(!!document.fullscreenElement);

    const { playSound, playMusic, stopMusic, isMuted, toggleMute } = useAudio();
    
    // --- Sistema de Puntuación Histórica ---
    const [playerName, setPlayerName] = useState<string>('');
    const [totalFood, setTotalFood] = useState(0);
    const [leaderboard, setLeaderboard] = useState<HighScoreEntry[]>([]);

    // --- Mecánica de Sprint y Cansancio ---
    const [sprintCharges, setSprintCharges] = useState<number>(MAX_SPRINT_CHARGES);
    const [isExhausted, setIsExhausted] = useState<boolean>(false);
    const [lastRegenTime, setLastRegenTime] = useState<number>(Date.now());

    // Cargar puntuación al inicio desde Supabase con fallback a localStorage
    useEffect(() => {
        const fetchScores = async () => {
            try {
                const { data, error } = await supabase
                    .from('catgame_high_scores')
                    .select('name, level, food')
                    .order('level', { ascending: false })
                    .order('food', { ascending: false })
                    .limit(10);
                
                if (error) throw error;
                if (data) {
                    setLeaderboard(data as HighScoreEntry[]);
                }
            } catch (error) {
                console.error("Fallo al cargar la tabla de récords desde Supabase, intentando localStorage...", error);
                try {
                    const savedScores = localStorage.getItem('leaderboard');
                    if (savedScores) {
                        const parsedScores = JSON.parse(savedScores) as HighScoreEntry[];
                        parsedScores.sort((a, b) => {
                            if (b.level !== a.level) return b.level - a.level;
                            return b.food - a.food;
                        });
                        setLeaderboard(parsedScores.slice(0, 10));
                    }
                } catch (localError) {
                    console.error("Fallo al cargar la tabla de récords desde localStorage", localError);
                }
            }
        };

        fetchScores();
    }, []);

    // Intervalo periódico de regeneración de energía (Sprint)
    useEffect(() => {
        if (gameState !== GameState.PLAYING) return;

        const regenInterval = setInterval(() => {
            setSprintCharges(prev => {
                if (prev >= MAX_SPRINT_CHARGES) {
                    setLastRegenTime(Date.now());
                    return MAX_SPRINT_CHARGES;
                }
                
                const now = Date.now();
                const elapsed = now - lastRegenTime;
                const rate = isExhausted ? 400 : 300; // 400ms por carga si está cansado, 300ms normal
                
                if (elapsed >= rate) {
                    const chargesToGain = Math.floor(elapsed / rate);
                    const nextCharges = Math.min(MAX_SPRINT_CHARGES, prev + chargesToGain);
                    
                    if (isExhausted && nextCharges >= 1) {
                        setIsExhausted(false);
                    }
                    
                    setLastRegenTime(now - (elapsed % rate));
                    return nextCharges;
                }
                return prev;
            });
        }, 50); // Comprobación cada 50ms para mantener la interfaz de usuario sincronizada en tiempo real

        return () => clearInterval(regenInterval);
    }, [gameState, lastRegenTime, isExhausted]);

    useEffect(() => {
        setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
    }, []);
    
    useEffect(() => {
        const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', onFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
    }, []);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error al intentar activar el modo de pantalla completa: ${err.message} (${err.name})`);
            });
        } else {
            document.exitFullscreen();
        }
    };

    const isWall = (pos: Position) => {
        const wall = pos.x < 0 || pos.x >= BOARD_WIDTH || pos.y < 0 || pos.y >= BOARD_HEIGHT;
        return wall;
    };
    const isRack = useCallback((pos: Position) => racks.some(r => arePositionsEqual(r, pos)), [racks]);
    
    const getForkliftCellsAt = (position: Position): Position[] => {
        const cells: Position[] = [];
        for (let i = 0; i < 2; i++) {
            for (let j = 0; j < 2; j++) {
                cells.push({ x: position.x + i, y: position.y + j });
            }
        }
        return cells;
    };
    
    const getEnemyOccupiedCells = useCallback((enemy: Enemy): Position[] => {
        if (enemy.type === EnemyType.WORKER) {
            return [enemy.position];
        }
        // PALLET_JACK (Forklift)
        return getForkliftCellsAt(enemy.position);
    }, []);

    const isMoveValid = useCallback((enemy: Enemy, newTopLeftPos: Position, allEnemies: Enemy[]): boolean => {
        const otherEnemies = allEnemies.filter(e => e.id !== enemy.id);
        const otherEnemyCells = otherEnemies.flatMap(getEnemyOccupiedCells);

        const targetCells = enemy.type === EnemyType.WORKER ? [newTopLeftPos] : getForkliftCellsAt(newTopLeftPos);

        for (const cell of targetCells) {
            if (isWall(cell) || isRack(cell)) {
                return false;
            }
            if (otherEnemyCells.some(otherCell => arePositionsEqual(cell, otherCell))) {
                return false; // Collides with another enemy
            }
        }
        return true;
    }, [isRack, getEnemyOccupiedCells]);

    const generateRacks = useCallback((): Rack[] => {
        const newRacks: Rack[] = [];

        // Diseño estático para coincidir con la captura de pantalla
        const rackRows: { y: number, startX: number, endX: number, gapStart: number, gapEnd: number }[] = [
            // Estante superior
            { y: 4, startX: 2, endX: 21, gapStart: 17, gapEnd: 19 },
            // Estante del medio (debajo de la salida)
            { y: 10, startX: 2, endX: 21, gapStart: 7, gapEnd: 9 },
            // Estante inferior
            { y: 15, startX: 2, endX: 21, gapStart: 3, gapEnd: 5 },
        ];

        for (const row of rackRows) {
            for (let x = row.startX; x <= row.endX; x++) {
                if (x >= row.gapStart && x <= row.gapEnd) {
                    continue; // Omitir el hueco
                }
                newRacks.push({ x, y: row.y });
            }
        }

        return newRacks;
    }, []);
    
    const getRandomPatrolTarget = useCallback((currentRacks: Rack[]): Position => {
        let pos: Position;
        const occupiedByRacks = (p: Position) => currentRacks.some(r => arePositionsEqual(r, p));
        do {
            pos = {
                x: Math.floor(Math.random() * BOARD_WIDTH),
                y: Math.floor(Math.random() * BOARD_HEIGHT),
            };
        } while (occupiedByRacks(pos) || isWall(pos));
        return pos;
    }, []);

    const resetLevel = useCallback((newLevel: number) => {
        const newRacks = generateRacks();
        setRacks(newRacks);
        setAllFoodCollected(false);
        setGameMessage(null);
        setIsHiding(false);
        if (hideTimeoutId) clearTimeout(hideTimeoutId);
        setHideTimeoutId(null);
        setIsCaptureInProgress(false);

        setEnemiesFrozen(false);
        if (freezeTimeoutId) clearTimeout(freezeTimeoutId);
        setFreezeTimeoutId(null);

        setIsInvulnerable(false);
        if (invulnerabilityTimeoutId) clearTimeout(invulnerabilityTimeoutId);
        setInvulnerabilityTimeoutId(null);

        const occupiedByRacks = (pos: Position) => newRacks.some(r => arePositionsEqual(r, pos));
        let newPlayerPos = { x: 1, y: 1 };
        while(occupiedByRacks(newPlayerPos)){
            newPlayerPos = { x: newPlayerPos.x + 1, y: newPlayerPos.y };
        }
        setPlayerPosition(newPlayerPos);

        const isBossLevel = newLevel === 10;
        const numForklifts = isBossLevel ? 2 : (newLevel < 4 ? 1 : 2);
        const numWorkers = isBossLevel ? 9 : newLevel;
        const newEnemies: Enemy[] = [];
        let enemyIdCounter = 0;

        for (let i = 0; i < numWorkers; i++) {
            let workerPos: Position;
            let attempts = 0;
            do {
                workerPos = {
                    x: exitPosition.x - 2 - Math.floor(Math.random() * 4),
                    y: exitPosition.y + (i % 5 - 2) + (Math.floor(Math.random() * 5) - 2)
                };
                if (attempts++ > 50) { 
                    workerPos = { x: BOARD_WIDTH - 2, y: 1 + i };
                    break;
                }
            } while (isWall(workerPos) || occupiedByRacks(workerPos));

            newEnemies.push({
                id: Date.now() + enemyIdCounter++,
                position: workerPos,
                type: EnemyType.WORKER,
                speed: WORKER_SPEED,
                moveCounter: 0,
                state: EnemyState.PATROLLING,
                patrolTarget: getRandomPatrolTarget(newRacks),
            });
        }
        
        const forkliftSpawnPoints: Position[] = [
            { x: BOARD_WIDTH - 4, y: 3 },  
            { x: BOARD_WIDTH - 4, y: 11 },
            { x: BOARD_WIDTH - 4, y: 7 },
        ];

        for (let i = forkliftSpawnPoints.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [forkliftSpawnPoints[i], forkliftSpawnPoints[j]] = [forkliftSpawnPoints[j], forkliftSpawnPoints[i]];
        }
        
        for (let i = 0; i < numForklifts; i++) {
            const spawnPos = forkliftSpawnPoints[i];
            newEnemies.push({
                id: Date.now() + enemyIdCounter++,
                position: spawnPos,
                type: EnemyType.PALLET_JACK,
                speed: PALLET_JACK_SPEED,
                moveCounter: 0,
                state: EnemyState.PATROLLING,
                patrolTarget: getRandomPatrolTarget(newRacks),
            });
        }
        
        if (isBossLevel) {
            const bossSpawnPos = { x: Math.floor(BOARD_WIDTH / 2), y: Math.floor(BOARD_HEIGHT / 2) };
            newEnemies.push({
                id: Date.now() + 999,
                position: bossSpawnPos,
                type: EnemyType.PALLET_JACK,
                speed: 1.5, // Faster than normal pallet jacks
                moveCounter: 0,
                state: EnemyState.CHASING, // Always chasing
                isBoss: true,
            });
        }
        setEnemies(newEnemies);
        
        const existingPos = [newPlayerPos, ...newEnemies.flatMap(getEnemyOccupiedCells)];
        const newFoodItems: FoodItem[] = [];
        const isAtExit = (pos: Position) => pos.x >= exitPosition.x && pos.x < exitPosition.x + 2 && pos.y >= exitPosition.y && pos.y < exitPosition.y + 2;
        
        for (let i = 0; i < FOOD_PER_LEVEL; i++) {
             let foodPos: Position;
             do {
                foodPos = {
                    x: Math.floor(Math.random() * BOARD_WIDTH),
                    y: Math.floor(Math.random() * BOARD_HEIGHT),
                };
            } while (occupiedByRacks(foodPos) || existingPos.some(p => arePositionsEqual(p, foodPos)) || isAtExit(foodPos));
            
            newFoodItems.push({
                id: Date.now() + i,
                position: foodPos,
                emoji: FOOD_EMOJIS[Math.floor(Math.random() * FOOD_EMOJIS.length)],
            });
            existingPos.push(foodPos);
        }
        setFoodItems(newFoodItems);

        // Spawn PowerUps (10% chance per level or fixed amount)
        const newPowerUps: PowerUp[] = [];
        if (Math.random() < 0.3) { // 30% chance for a powerup to spawn
             let powerUpPos: Position;
             do {
                powerUpPos = {
                    x: Math.floor(Math.random() * BOARD_WIDTH),
                    y: Math.floor(Math.random() * BOARD_HEIGHT),
                };
            } while (occupiedByRacks(powerUpPos) || existingPos.some(p => arePositionsEqual(p, powerUpPos)) || isAtExit(powerUpPos));
            
            newPowerUps.push({
                id: Date.now() + 1000,
                position: powerUpPos,
                type: PowerUpType.FREEZE_ENEMIES,
            });
        }
        setPowerUps(newPowerUps);

    }, [exitPosition, generateRacks, getRandomPatrolTarget, hideTimeoutId, getEnemyOccupiedCells, invulnerabilityTimeoutId, freezeTimeoutId]);

    const startGame = () => {
        setLives(INITIAL_LIVES);
        setLevel(1);
        setTotalFood(0);
        resetLevel(1);
        setGameState(GameState.PLAYING);
        setKey(prev => prev + 1);
        setIsCaptureInProgress(false);
        playMusic();
        playSound('start');
    };
    
    const startBossFight = () => {
        setLives(INITIAL_LIVES);
        setLevel(10);
        setTotalFood(0);
        resetLevel(10);
        setGameState(GameState.BOSS_LEVEL_START);
        setKey(prev => prev + 1);
        setIsCaptureInProgress(false);
        playSound('start');
    };
    
    const nextLevel = () => {
        const newLevel = level + 1;
        setLevel(newLevel);
        resetLevel(newLevel);
        if (newLevel === 10) {
            setGameState(GameState.BOSS_LEVEL_START);
        } else {
            setGameState(GameState.PLAYING);
            playMusic();
        }
    };

    const togglePause = () => {
        if (gameState === GameState.PLAYING) {
            setGameState(GameState.PAUSED);
        } else if (gameState === GameState.PAUSED) {
            setGameState(GameState.PLAYING);
        }
    };

    const returnToMenu = () => {
        setGameState(GameState.NOT_STARTED);
    };

    const handlePlayerMove = useCallback((direction: Direction) => {
        if (gameState !== GameState.PLAYING || isCaptureInProgress) return;

        const now = Date.now();
        let currentCharges = sprintCharges;
        const elapsed = now - lastRegenTime;
        const rate = isExhausted ? 400 : 300;

        // Calcular regeneración acumulada en el momento del movimiento
        if (elapsed >= rate) {
            const chargesToGain = Math.floor(elapsed / rate);
            currentCharges = Math.min(MAX_SPRINT_CHARGES, currentCharges + chargesToGain);
        }

        // Si no tiene suficiente energía (menos de 1 carga), bloquea el movimiento
        if (currentCharges < 1) {
            return;
        }

        // Deducir 1 carga
        const nextCharges = currentCharges - 1;
        setSprintCharges(nextCharges);
        setLastRegenTime(now); // Reiniciamos el tiempo para la próxima regeneración desde el movimiento

        // Entrar en estado cansado (fatiga) si la energía cae a 0 (menor a 1)
        if (nextCharges < 1) {
            setIsExhausted(true);
        }

        setPlayerPosition(prev => {
            let { x, y } = prev;
            if (direction === 'up') y--;
            if (direction === 'down') y++;
            if (direction === 'left') x--;
            if (direction === 'right') x++;

            const newPos = { x, y };

            if (isWall(newPos)) {
                return prev;
            }

            const wasOnRack = isRack(prev);
            const willBeOnRack = isRack(newPos);

            if (!wasOnRack && willBeOnRack) {
                setIsHiding(true);
                playSound('hide');
                if (hideTimeoutId) clearTimeout(hideTimeoutId);
                const timeout = setTimeout(() => {
                    setIsHiding(false);
                    setHideTimeoutId(null);
                }, HIDING_DURATION_MS);
                setHideTimeoutId(timeout);
            } 
            else if (wasOnRack && !willBeOnRack) {
                setIsHiding(false);
                if (hideTimeoutId) {
                    clearTimeout(hideTimeoutId);
                    setHideTimeoutId(null);
                }
            }
            return newPos;
        });
    }, [gameState, isRack, hideTimeoutId, isWall, isCaptureInProgress, playSound, sprintCharges, lastRegenTime, isExhausted]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                return;
            }

            const keyMap: { [key: string]: Direction } = {
                ArrowUp: 'up', W: 'up', w: 'up',
                ArrowDown: 'down', S: 'down', s: 'down',
                ArrowLeft: 'left', A: 'left', a: 'left',
                ArrowRight: 'right', D: 'right', d: 'right',
            };
            if (keyMap[e.key]) {
                e.preventDefault();
                handlePlayerMove(keyMap[e.key]);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handlePlayerMove]);

    const getNextStep = useCallback((start: Position, target: Position | null, enemy: Enemy, allEnemies: Enemy[]): Position => {
        if (!target) return start;

        const dx = target.x - start.x;
        const dy = target.y - start.y;

        const preferredMove = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        const fallbackMove = Math.abs(dx) > Math.abs(dy) ? (dy > 0 ? 'down' : 'up') : (dx > 0 ? 'right' : 'left');

        const moves: Direction[] = [preferredMove, fallbackMove];
        if (preferredMove === 'left' || preferredMove === 'right') {
            moves.push('up', 'down');
        } else {
            moves.push('left', 'right');
        }
        
        const uniqueMoves = [...new Set(moves)];

        const tryMove = (dir: Direction): Position | null => {
            let { x, y } = start;
            if (dir === 'up') y--; if (dir === 'down') y++; if (dir === 'left') x--; if (dir === 'right') x++;
            const newPos = { x, y };
            if (isMoveValid(enemy, newPos, allEnemies)) {
                return newPos;
            }
            return null;
        };

        for (const move of uniqueMoves) {
            const nextPos = tryMove(move);
            if (nextPos) return nextPos;
        }

        return start;
    }, [isMoveValid]);


    const createParticles = useCallback((x: number, y: number, emoji: string, color?: string) => {
        const newParticles: Particle[] = [];
        for (let i = 0; i < 8; i++) {
            newParticles.push({
                id: Date.now() + Math.random(),
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                emoji,
                life: 1.0,
                color,
            });
        }
        setParticles(prev => [...prev, ...newParticles]);
    }, []);

    const gameLoop = useCallback(() => {
        if (gameState !== GameState.PLAYING || isCaptureInProgress) return;

        // Update particles
        setParticles(prevParticles => {
            return prevParticles.map(p => ({
                ...p,
                x: p.x + p.vx,
                y: p.y + p.vy,
                life: p.life - 0.05
            })).filter(p => p.life > 0);
        });

        if (!isHiding) {
            setLastKnownPlayerPosition(playerPosition);
        }

        setEnemies(prevEnemies => {
            if (enemiesFrozen) return prevEnemies;

            return prevEnemies.map(enemy => {
                const newMoveCounter = enemy.moveCounter + 1;
                if (newMoveCounter < enemy.speed) {
                    return { ...enemy, moveCounter: newMoveCounter };
                }

                if (enemy.type === EnemyType.WORKER && Math.random() < 0.1) {
                    return { ...enemy, moveCounter: 0 }; 
                }
                
                let currentEnemy = { ...enemy, moveCounter: 0 };
                
                if (currentEnemy.isBoss) {
                    const newPosition = getNextStep(currentEnemy.position, playerPosition, currentEnemy, prevEnemies);
                    return { ...currentEnemy, position: newPosition };
                }
                
                let newPosition = currentEnemy.position;
                let newPatrolTarget = currentEnemy.patrolTarget;
                let newState = currentEnemy.state;
                let newPathHistory = [...(currentEnemy.pathHistory || []), currentEnemy.position].slice(-4);

                if (currentEnemy.type === EnemyType.WORKER) {
                    const distanceToPlayer = Math.hypot(playerPosition.x - currentEnemy.position.x, playerPosition.y - currentEnemy.position.y);
                    const canSeePlayer = !isHiding && distanceToPlayer <= WORKER_VISION_RANGE;

                    if (newState === EnemyState.PATROLLING && canSeePlayer) {
                        newState = EnemyState.CHASING;
                    } else if (newState === EnemyState.CHASING) {
                        if (isHiding) {
                            if (lastKnownPlayerPosition && arePositionsEqual(currentEnemy.position, lastKnownPlayerPosition)) {
                                newState = EnemyState.PATROLLING;
                                newPatrolTarget = getRandomPatrolTarget(racks);
                            }
                        } else if (distanceToPlayer > WORKER_VISION_RANGE) {
                            newState = EnemyState.PATROLLING;
                            newPatrolTarget = getRandomPatrolTarget(racks);
                        }
                    }

                    if (newState === EnemyState.CHASING) {
                        const target = isHiding ? lastKnownPlayerPosition : playerPosition;
                        newPosition = getNextStep(currentEnemy.position, target, currentEnemy, prevEnemies);
                    } else { // PATROLLING
                        if (!newPatrolTarget || arePositionsEqual(currentEnemy.position, newPatrolTarget)) {
                            newPatrolTarget = getRandomPatrolTarget(racks);
                        }
                        newPosition = getNextStep(currentEnemy.position, newPatrolTarget, currentEnemy, prevEnemies);
                    }
                } else { // PALLET_JACK - With anti-stuck logic
                    const pathHistory = currentEnemy.pathHistory || [];
                    const isOscillating = pathHistory.length >= 2 && arePositionsEqual(pathHistory[pathHistory.length - 2], currentEnemy.position);

                    if (isOscillating) {
                        newPatrolTarget = getRandomPatrolTarget(racks);
                        const lastPos = pathHistory[pathHistory.length - 1];
                        const directions: Direction[] = ['up', 'down', 'left', 'right'];

                        for (let i = directions.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [directions[i], directions[j]] = [directions[j], directions[i]];
                        }

                        let evasiveMoveFound = false;
                        for (const dir of directions) {
                            let { x, y } = currentEnemy.position;
                            if (dir === 'up') y--; if (dir === 'down') y++; if (dir === 'left') x--; if (dir === 'right') x++;
                            const potentialPos = { x, y };

                            if (!arePositionsEqual(potentialPos, lastPos) && isMoveValid(currentEnemy, potentialPos, prevEnemies)) {
                                newPosition = potentialPos;
                                evasiveMoveFound = true;
                                break;
                            }
                        }
                        
                        if (!evasiveMoveFound) {
                            newPosition = getNextStep(currentEnemy.position, newPatrolTarget, currentEnemy, prevEnemies);
                        }
                    } else {
                        const distanceToTarget = newPatrolTarget ? Math.hypot(newPatrolTarget.x - currentEnemy.position.x, newPatrolTarget.y - currentEnemy.position.y) : Infinity;
                        if (!newPatrolTarget || distanceToTarget < 2) { 
                            newPatrolTarget = getRandomPatrolTarget(racks);
                        }
                        newPosition = getNextStep(currentEnemy.position, newPatrolTarget, currentEnemy, prevEnemies);
                    }
                }

                return { ...currentEnemy, position: newPosition, state: newState, patrolTarget: newPatrolTarget, pathHistory: newPathHistory };
            });
        });
        
        const remainingFood = foodItems.filter(food => !arePositionsEqual(playerPosition, food.position));
        if (remainingFood.length < foodItems.length) {
            const collectedAmount = foodItems.length - remainingFood.length;
            setTotalFood(prev => prev + collectedAmount);
            playSound('collect');
            
            // Particles
            const collectedItems = foodItems.filter(food => arePositionsEqual(playerPosition, food.position));
            collectedItems.forEach(item => {
                createParticles(item.position.x * GRID_SIZE + GRID_SIZE / 2, item.position.y * GRID_SIZE + GRID_SIZE / 2, item.emoji);
                
                // Determinar cargas a regenerar según el tipo de comida
                let sprintRegen = 1;
                if (item.emoji === '🥫') sprintRegen = 2;
                if (item.emoji === '🍖') sprintRegen = 3;

                setSprintCharges(prev => {
                    const nextCharges = Math.min(MAX_SPRINT_CHARGES, prev + sprintRegen);
                    if (isExhausted && nextCharges >= 1) {
                        setIsExhausted(false);
                    }
                    return nextCharges;
                });
            });

            setFoodItems(remainingFood);
            if (remainingFood.length === 0 && !allFoodCollected) {
                 setAllFoodCollected(true);
                 setGameMessage(`¡Comida recogida! ¡Corre a la salida ${EXIT_EMOJI}!`);
            }
        }

        const remainingPowerUps = powerUps.filter(p => !arePositionsEqual(playerPosition, p.position));
        if (remainingPowerUps.length < powerUps.length) {
            const collectedPowerUps = powerUps.filter(p => arePositionsEqual(playerPosition, p.position));
            collectedPowerUps.forEach(p => {
                createParticles(p.position.x * GRID_SIZE + GRID_SIZE / 2, p.position.y * GRID_SIZE + GRID_SIZE / 2, POWERUP_EMOJI, '#A5F3FC');
                
                if (p.type === PowerUpType.FREEZE_ENEMIES) {
                    setEnemiesFrozen(true);
                    setGameMessage("¡Enemigos Congelados! ❄️");
                    playSound('collect'); // Or a specific sound
                    if (freezeTimeoutId) clearTimeout(freezeTimeoutId);
                    const id = setTimeout(() => {
                        setEnemiesFrozen(false);
                        setFreezeTimeoutId(null);
                        setGameMessage(null);
                    }, FREEZE_DURATION_MS);
                    setFreezeTimeoutId(id);
                }
            });
            setPowerUps(remainingPowerUps);
        }
        
        if (!isHiding && !isInvulnerable) {
            const allEnemyCells = enemies.flatMap(getEnemyOccupiedCells);
            const collision = allEnemyCells.some(cell => arePositionsEqual(playerPosition, cell));
            if (collision) {
                setIsCaptureInProgress(true);
                setCapturedPosition(playerPosition);
                setGameMessage(null);
                playSound('capture');
                if (hideTimeoutId) clearTimeout(hideTimeoutId);

                setTimeout(() => {
                    const newLives = lives - 1;
                    setLives(newLives);
                    if (newLives > 0) {
                        setPlayerPosition({ x: 1, y: 1 });
                        setIsHiding(false);
                        setHideTimeoutId(null);
                        setIsCaptureInProgress(false);
                        setCapturedPosition(null);

                        setIsInvulnerable(true);
                        playSound('respawn');
                        if (invulnerabilityTimeoutId) clearTimeout(invulnerabilityTimeoutId);
                        const timeout = setTimeout(() => {
                            setIsInvulnerable(false);
                            setInvulnerabilityTimeoutId(null);
                        }, 5000);
                        setInvulnerabilityTimeoutId(timeout);
                    } else {
                        const finalName = playerName.trim() === '' ? 'Gato Anónimo' : playerName;
                        const currentScore = { name: finalName, level, food: totalFood };

                        // Guardado asíncrono en Supabase
                        const saveScore = async () => {
                            try {
                                // Buscar si ya existe un registro con ese nombre
                                const { data: existing, error: searchError } = await supabase
                                    .from('catgame_high_scores')
                                    .select('id, level, food')
                                    .eq('name', finalName)
                                    .maybeSingle();
                                
                                if (searchError) throw searchError;

                                if (existing) {
                                    // Si existe, actualizar si el nuevo puntaje es superior
                                    const isNewRecord = level > existing.level || (level === existing.level && totalFood > existing.food);
                                    if (isNewRecord) {
                                        const { error: updateError } = await supabase
                                            .from('catgame_high_scores')
                                            .update({ level, food: totalFood })
                                            .eq('id', existing.id);
                                        if (updateError) throw updateError;
                                    }
                                } else {
                                    // Si no existe, insertar
                                    const { error: insertError } = await supabase
                                        .from('catgame_high_scores')
                                        .insert([currentScore]);
                                    if (insertError) throw insertError;
                                }
                                
                                // Refrescar leaderboard de Supabase
                                const { data: freshData, error: fetchError } = await supabase
                                    .from('catgame_high_scores')
                                    .select('name, level, food')
                                    .order('level', { ascending: false })
                                    .order('food', { ascending: false })
                                    .limit(10);
                                if (fetchError) throw fetchError;
                                if (freshData) {
                                    setLeaderboard(freshData as HighScoreEntry[]);
                                }
                            } catch (err) {
                                console.error("Error al guardar/recuperar récord en Supabase:", err);
                            }
                        };

                        saveScore();

                        // Guardado local (fallback/redundancia)
                        const updatedLeaderboard = [...leaderboard];
                        const existingScoreIndex = updatedLeaderboard.findIndex(score => score.name === finalName);

                        if (existingScoreIndex !== -1) {
                            const existingScore = updatedLeaderboard[existingScoreIndex];
                            if (currentScore.level > existingScore.level || (currentScore.level === existingScore.level && currentScore.food > existingScore.food)) {
                                updatedLeaderboard[existingScoreIndex] = currentScore;
                            }
                        } else {
                            updatedLeaderboard.push(currentScore);
                        }
                        
                        updatedLeaderboard.sort((a, b) => {
                            if (b.level !== a.level) return b.level - a.level;
                            return b.food - a.food;
                        });

                        const finalLeaderboard = updatedLeaderboard.slice(0, 10);
                        setLeaderboard(finalLeaderboard);
                        localStorage.setItem('leaderboard', JSON.stringify(finalLeaderboard));

                        setGameState(GameState.GAME_OVER);
                        playSound('gameOver');
                        stopMusic();
                    }
                }, 2000);
            }
        }

        const isPlayerAtExit = allFoodCollected && 
                               playerPosition.x >= exitPosition.x && playerPosition.x < exitPosition.x + 2 &&
                               playerPosition.y >= exitPosition.y && playerPosition.y < exitPosition.y + 2;

        if (isPlayerAtExit) {
            if (level === 10) {
                setGameState(GameState.CREDITS);
            } else {
                setGameState(GameState.LEVEL_COMPLETE);
            }
            playSound('levelComplete');
            stopMusic();
        }

    }, [gameState, playerPosition, foodItems, enemies, lives, getNextStep, isHiding, allFoodCollected, exitPosition, lastKnownPlayerPosition, hideTimeoutId, racks, getRandomPatrolTarget, isCaptureInProgress, playSound, stopMusic, getEnemyOccupiedCells, isInvulnerable, invulnerabilityTimeoutId, totalFood, level, leaderboard, playerName, createParticles, powerUps, enemiesFrozen, freezeTimeoutId]);

    useEffect(() => {
        if (gameState === GameState.PLAYING) {
            const interval = setInterval(gameLoop, BASE_GAME_TICK);
            return () => clearInterval(interval);
        }
    }, [gameState, gameLoop]);

    const renderModal = () => {
        const buttonClass = "bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-slate-900 font-extrabold py-3.5 px-8 rounded-xl text-lg transition-all duration-300 transform hover:scale-[1.03] active:scale-[0.98] shadow-lg hover:shadow-yellow-500/20 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:ring-offset-slate-900 w-full sm:w-auto select-none";
        const bossButtonClass = "bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-extrabold py-3.5 px-8 rounded-xl text-lg transition-all duration-300 transform hover:scale-[1.03] active:scale-[0.98] shadow-lg hover:shadow-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-slate-900 w-full sm:w-auto select-none";

        switch (gameState) {
            case GameState.NOT_STARTED:
                return (
                    <Modal title="🐱 Centro de Distribución">
                        <div className="mb-4">
                            <label htmlFor="playerName" className="block text-lg font-bold mb-2">Ingresa tu nombre (opcional):</label>
                            <input
                              id="playerName"
                              type="text"
                              value={playerName}
                              onChange={(e) => setPlayerName(e.target.value)}
                              placeholder="Gato Anónimo"
                              maxLength={15}
                              className="w-full max-w-sm mx-auto p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-white text-center font-bold text-lg placeholder-slate-600 focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 transition-all shadow-inner"
                            />
                        </div>
                        {leaderboard.length > 0 && (
                            <div className="mb-4 p-4 bg-slate-950/40 rounded-2xl border border-slate-800 shadow-inner">
                                <h3 className="text-lg font-black text-amber-400 mb-3 flex items-center justify-center gap-2 tracking-wide">
                                    🏆 SALÓN DE LA FAMA 🏆
                                </h3>
                                <ol className="text-left text-sm space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                                    {leaderboard.map((score, index) => {
                                        let medal = '';
                                        let rankBg = 'bg-slate-900/60 border-slate-800/50';
                                        let nameColor = 'text-slate-200';
                                        
                                        if (index === 0) {
                                            medal = '🥇';
                                            rankBg = 'bg-amber-500/10 border-amber-500/20';
                                            nameColor = 'text-amber-300 font-extrabold';
                                        } else if (index === 1) {
                                            medal = '🥈';
                                            rankBg = 'bg-slate-300/10 border-slate-300/20';
                                            nameColor = 'text-slate-300 font-extrabold';
                                        } else if (index === 2) {
                                            medal = '🥉';
                                            rankBg = 'bg-amber-700/10 border-amber-700/20';
                                            nameColor = 'text-amber-600 font-extrabold';
                                        }
                                        
                                        return (
                                            <li key={index} className={`flex justify-between items-center p-2 rounded-xl border ${rankBg} transition-all duration-150 hover:scale-[1.01]`}>
                                                <span className={`truncate mr-2 ${nameColor}`}>
                                                    {medal || `${index + 1}.`} {score.name}
                                                </span>
                                                <span className="text-slate-400 font-semibold shrink-0 text-xs">
                                                    Nivel <strong className="text-slate-200">{score.level}</strong> • Comida <strong className="text-slate-200">{score.food}</strong>
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ol>
                            </div>
                        )}
                        <div className="text-slate-300 text-sm space-y-1">
                            <p>¡Consigue <strong>{FOOD_PER_LEVEL} comidas</strong> 🐟 para poder escapar 🚚!</p>
                            <p>Usa las estanterías 🧱 para <strong>esconderte</strong> de los guardias.</p>
                        </div>
                        <p className="flex items-center justify-center gap-2 text-slate-400 text-sm mt-2">
                           <ForkliftIcon className="w-8 h-8 text-rose-500" /> 
                           <span>¡Cuidado con las veloces traspaletas!</span>
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-6">
                            <button onClick={startGame} className={buttonClass}>¡Empezar a Jugar!</button>
                            <button onClick={startBossFight} className={bossButtonClass}>Jefe Final</button>
                        </div>
                    </Modal>
                );
            case GameState.BOSS_LEVEL_START:
                return (
                    <Modal title="🚨 ¡ALERTA DE JEFE! 🚨">
                         <p className="text-2xl italic text-red-400 font-bold">"¡Maldito gato, te atraparé!"</p>
                         <p className="text-slate-300">El jefe de turno te perseguirá sin descanso montado en su traspaleta roja.</p>
                         <div className="mt-6">
                            <button onClick={() => { setGameState(GameState.PLAYING); playMusic(); }} className={buttonClass}>
                                ¡Comenzar Nivel 10!
                            </button>
                        </div>
                    </Modal>
                );
            case GameState.CREDITS:
                return (
                    <Modal title="🎉 ¡VICTORIA! 🎉">
                        <p className="text-2xl font-extrabold text-yellow-400">¡Lo lograste! El gato es libre.</p>
                        <p className="text-5xl my-4 animate-bounce">🐱👑</p>
                        <p className="text-lg italic text-slate-300 mb-6">Tu hazaña y tu gran apetito serán recordados por siempre.</p>
                        <div className="mt-6">
                            <button onClick={returnToMenu} className={buttonClass}>
                                Volver al Menú
                            </button>
                        </div>
                    </Modal>
                );
            case GameState.LEVEL_COMPLETE:
                return (
                    <Modal title={`¡Nivel ${level} Superado!`} >
                        <p className="text-slate-200">¡El gato escapó con éxito! Pero el próximo almacén es más peligroso...</p>
                        <p className="text-5xl my-4 animate-pulse">🚚💨</p>
                        <div className="mt-6">
                           <button onClick={nextLevel} className={buttonClass}>
                              { level < 9 ? `Ir al Nivel ${level + 1}`: '¡Ir al Jefe Final!'}
                           </button>
                        </div>
                    </Modal>
                );
            case GameState.GAME_OVER:
                 const finalName = playerName.trim() === '' ? 'Gato Anónimo' : playerName;
                return (
                    <Modal title="😿 Fin del Juego">
                        <p className="text-xl text-rose-400 font-bold">¡Oh no! El gato ha sido atrapado y escoltado fuera.</p>
                        <p className="text-slate-300">Alcanzaste el nivel <strong className="text-white">{level}</strong> y recolectaste <strong className="text-white">{totalFood}</strong> comidas.</p>
                        {leaderboard.length > 0 && (
                            <div className="mt-4 p-4 bg-slate-950/40 rounded-2xl border border-slate-800 shadow-inner">
                                <h3 className="text-base font-black text-amber-400 mb-3 flex items-center justify-center gap-2 tracking-wide">
                                    🏆 EL GATO MÁS GLOTÓN 🏆
                                </h3>
                                <ol className="text-left text-sm space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                                  {leaderboard.map((score, index) => (
                                     <li key={index} className={`flex justify-between items-center p-2 rounded-xl border ${score.name === finalName && score.level === level && score.food === totalFood ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-slate-900/60 border-slate-800/50'} transition-all duration-150`}>
                                         <span className={`truncate mr-2 ${score.name === finalName && score.level === level && score.food === totalFood ? 'text-yellow-400 font-extrabold' : 'text-slate-200'}`}>
                                             {index + 1}. {score.name}
                                         </span>
                                         <span className="text-slate-400 font-semibold shrink-0 text-xs">
                                             Nvl <strong className="text-slate-200">{score.level}</strong> • Com <strong className="text-slate-200">{score.food}</strong>
                                         </span>
                                     </li>
                                  ))}
                                </ol>
                            </div>
                        )}
                        <div className="mt-6">
                            <button onClick={returnToMenu} className={buttonClass}>Intentar de Nuevo</button>
                        </div>
                    </Modal>
                );
            case GameState.PAUSED:
                return (
                    <Modal title="⏸️ Pausa">
                        <p className="mb-6 text-slate-300">Juego en pausa. Tómate un respiro para recuperar energía.</p>
                         <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <button onClick={togglePause} className={buttonClass}>Continuar</button>
                            <button onClick={returnToMenu} className="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-extrabold py-3.5 px-8 rounded-xl text-lg transition-all duration-300 transform hover:scale-[1.03] active:scale-[0.98] shadow-lg hover:shadow-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-slate-900 w-full sm:w-auto select-none">Salir al Menú</button>
                         </div>
                    </Modal>
                );
            default:
                return null;
        }
    };
    
    const loadingDockPositions: Position[] = [];
    for(let i = 0; i < 2; i++) {
        for(let j = 0; j < 2; j++) {
            loadingDockPositions.push({ x: exitPosition.x + i, y: exitPosition.y + j });
        }
    }
    
    const [scale, setScale] = useState(1);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const headerRef = React.useRef<HTMLDivElement>(null);

    const handleResize = useCallback(() => {
        if (containerRef.current && headerRef.current) {
            const { width: containerWidth, height: containerHeight } = containerRef.current.getBoundingClientRect();
            const headerHeight = headerRef.current.offsetHeight;
            
            // Determinar si es móvil vertical (portrait)
            const isMobilePortrait = window.innerWidth < 640 && window.innerHeight > window.innerWidth;
            const dpadHeight = (isTouchDevice && gameState === GameState.PLAYING && isMobilePortrait) ? 180 : 0;
            
            const availableHeight = containerHeight - headerHeight - dpadHeight;

            const gameWidth = BOARD_WIDTH * GRID_SIZE;
            const gameHeight = BOARD_HEIGHT * GRID_SIZE;
            
            const scaleX = containerWidth / gameWidth;
            const scaleY = availableHeight / gameHeight;
            
            setScale(Math.max(0.1, Math.min(scaleX, scaleY, 1)));
        }
    }, [gameState, isTouchDevice]);

    useEffect(() => {
        handleResize();
        const resizeObserver = new ResizeObserver(handleResize);
        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }
        if (headerRef.current) {
             resizeObserver.observe(headerRef.current);
        }
        
        return () => resizeObserver.disconnect();
    }, [handleResize]);

    const scaledWidth = BOARD_WIDTH * GRID_SIZE;
    const scaledHeight = BOARD_HEIGHT * GRID_SIZE;
    
    const gameWrapperWidth = scaledWidth * scale;
    const gameWrapperHeight = scaledHeight * scale;

    return (
        <main className="flex flex-col items-center justify-center h-dvh w-screen bg-gray-900 text-white p-2 sm:p-4 font-sans overflow-hidden">
            <header className={`text-center mb-2 sm:mb-4 shrink-0 font-sans ${isTouchDevice && gameState === GameState.PLAYING ? 'hidden' : 'block'}`}>
                <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-yellow-300 via-orange-400 to-yellow-500 bg-clip-text text-transparent filter drop-shadow-md select-none">
                    🐾 Gato en el Centro de Distribución 🐾
                </h1>
                <p className="text-lg sm:text-xl text-gray-300 italic mt-2 tracking-wide font-light">
                    ¡Esquiva, come, escóndete y escapa!
                </p>
            </header>
            
            <div 
                className="flex-grow w-full flex items-center justify-center relative"
                ref={containerRef}
                style={{ minHeight: 0 }}
            >
                {renderModal()}
                
                <div 
                    className="bg-slate-800/30 backdrop-blur-sm p-1.5 sm:p-2.5 rounded-2xl border border-slate-700/30 shadow-2xl flex flex-col items-center justify-center transition-all duration-300"
                    style={{ 
                        visibility: gameState === GameState.NOT_STARTED || gameState === GameState.CREDITS ? 'hidden' : 'visible'
                    }}
                >
                    <div ref={headerRef} className="flex justify-between items-center backdrop-blur-md bg-slate-900/90 text-white p-2 sm:p-3 rounded-t-xl border-t border-x border-slate-700/40 shadow-2xl text-xs sm:text-sm font-bold w-full flex-wrap gap-1.5 sm:gap-2" style={{ width: gameWrapperWidth }}>
                        <div className="flex items-center space-x-1.5 sm:space-x-2 flex-wrap gap-y-1">
                            <div className="whitespace-nowrap bg-blue-500/10 text-blue-300 border border-blue-500/20 px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-lg flex items-center gap-1 sm:gap-1.5 shadow-inner">
                                <span className="text-[8px] sm:text-[10px] text-blue-400 font-extrabold">NIVEL</span>
                                <span className="font-extrabold text-blue-100 text-xs sm:text-sm">{level}</span>
                            </div>
                            <div className="whitespace-nowrap bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-lg flex items-center gap-1 sm:gap-1.5 shadow-inner">
                                <span className="text-[8px] sm:text-[10px] text-emerald-400 font-extrabold">COMIDA</span>
                                <span className="font-extrabold text-emerald-100 text-xs sm:text-sm">{FOOD_PER_LEVEL - foodItems.length} / {FOOD_PER_LEVEL}</span>
                            </div>
                            <div className="whitespace-nowrap bg-amber-500/10 text-amber-300 border border-amber-500/20 px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-lg flex items-center gap-1 sm:gap-1.5 shadow-inner">
                                <span className="text-[8px] sm:text-[10px] text-amber-400 font-extrabold">RÉCORD 🏆</span>
                                <span className="font-extrabold text-amber-100 text-xs sm:text-sm">{leaderboard.length > 0 ? `${leaderboard[0].level}-${leaderboard[0].food}` : '0-0'}</span>
                            </div>
                        </div>
                        
                        <div className="flex items-center space-x-1 select-none whitespace-nowrap bg-slate-950/60 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg border border-slate-800">
                            <span className="text-[8px] sm:text-[9px] text-slate-400 font-extrabold tracking-wider mr-1 sm:mr-1.5">ESTAMINA:</span>
                            <div className="flex space-x-0.5">
                                {Array.from({ length: MAX_SPRINT_CHARGES }).map((_, i) => {
                                    const isActive = i < Math.floor(sprintCharges);
                                    let energyColor = 'bg-emerald-500';
                                    if (sprintCharges <= 3) energyColor = 'bg-rose-500';
                                    else if (sprintCharges <= 6) energyColor = 'bg-amber-500';
                                    
                                    return (
                                        <div 
                                            key={i} 
                                            className={`w-1 sm:w-2 h-2 sm:h-3 rounded-sm transition-all duration-200 ${
                                                isExhausted 
                                                    ? 'bg-rose-500 animate-pulse border border-rose-400/20 shadow-[0_0_8px_rgba(244,63,94,0.4)]' 
                                                    : isActive 
                                                        ? `${energyColor} shadow-[0_0_6px_rgba(16,185,129,0.2)]` 
                                                        : 'bg-slate-800 opacity-20 border border-slate-700/30'
                                            }`}
                                        />
                                    );
                                })}
                            </div>
                            {isExhausted && (
                                <span className="text-[7px] sm:text-[9px] text-rose-400 bg-rose-950/30 border border-rose-500/20 px-1 sm:px-1.5 py-0.2 sm:py-0.5 rounded ml-1 sm:ml-2 animate-pulse font-extrabold uppercase tracking-wide">
                                    Cansado
                                </span>
                            )}
                        </div>

                        <div className="flex items-center space-x-2 sm:space-x-4 ml-auto">
                            <div className="flex space-x-1">
                                <button onClick={togglePause} className="text-xs sm:text-base p-1 sm:p-1.5 bg-slate-800/80 hover:bg-slate-700/80 rounded-md border border-slate-700/40 transition-colors focus:outline-none" aria-label="Pausar juego">
                                    ⏸️
                                </button>
                                <button onClick={toggleFullscreen} className="text-xs sm:text-base p-1 sm:p-1.5 bg-slate-800/80 hover:bg-slate-700/80 rounded-md border border-slate-700/40 transition-colors focus:outline-none" aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}>
                                    {isFullscreen ? '↘' : '⛶'}
                                </button>
                                <button onClick={toggleMute} className="text-xs sm:text-base p-1 sm:p-1.5 bg-slate-800/80 hover:bg-slate-700/80 rounded-md border border-slate-700/40 transition-colors focus:outline-none" aria-label={isMuted ? 'Activar sonido' : 'Silenciar'}>
                                    {isMuted ? '🔇' : '🔊'}
                                </button>
                            </div>
                            <div className="flex items-center space-x-0.5 sm:space-x-1 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg shadow-inner">
                            {Array.from({ length: lives }).map((_, i) => (
                               <span key={i} className="text-red-500 text-xs sm:text-base animate-pulse">❤️</span>
                            ))}
                            </div>
                        </div>
                    </div>
                    
                    <div
                      key={key}
                      className="relative bg-gray-600 bg-checkered overflow-hidden border-x border-b border-slate-700/40 shadow-2xl rounded-b-xl"
                      style={{ 
                          width: gameWrapperWidth, 
                          height: gameWrapperHeight,
                      }}
                    >
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: scaledWidth,
                            height: scaledHeight,
                            transform: `scale(${scale})`,
                            transformOrigin: 'top left',
                        }}>
                            {gameMessage && <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/60 text-white px-4 py-2 rounded-lg z-20 text-center animate-pulse">{gameMessage}</div>}
                            
                            {(gameState !== GameState.NOT_STARTED && gameState !== GameState.CREDITS) && (
                              <>
                                {loadingDockPositions.map((pos, i) => (
                                    <div key={`dock-${i}`} className="absolute bg-gray-700/80 border-l-4 border-yellow-400" style={{ left: pos.x * GRID_SIZE, top: pos.y * GRID_SIZE, width: GRID_SIZE, height: GRID_SIZE, boxSizing: 'border-box' }}></div>
                                ))}
                                {racks.map((rack, i) => (
                                     <div key={`rack-${i}`} className="absolute bg-gray-700 border-t border-gray-500" style={{ left: rack.x * GRID_SIZE, top: rack.y * GRID_SIZE, width: GRID_SIZE, height: GRID_SIZE, boxSizing: 'border-box' }}></div>
                                ))}
                                <div className="absolute text-6xl z-10 flex justify-center items-center" style={{ left: exitPosition.x * GRID_SIZE, top: exitPosition.y * GRID_SIZE, width: GRID_SIZE * 2, height: GRID_SIZE * 2 }}>{EXIT_EMOJI}</div>
                                {foodItems.map(food => (
                                    <div key={food.id} className="absolute text-4xl animate-bounce flex justify-center items-center" style={{ left: food.position.x * GRID_SIZE, top: food.position.y * GRID_SIZE, width: GRID_SIZE, height: GRID_SIZE }}>{food.emoji}</div>
                                ))}
                                {powerUps.map(p => (
                                    <div key={p.id} className="absolute text-4xl animate-pulse flex justify-center items-center" style={{ left: p.position.x * GRID_SIZE, top: p.position.y * GRID_SIZE, width: GRID_SIZE, height: GRID_SIZE }}>{POWERUP_EMOJI}</div>
                                ))}
                                {particles.map(p => (
                                     <div key={p.id} className="absolute text-2xl pointer-events-none" 
                                         style={{ 
                                            left: p.x, 
                                            top: p.y, 
                                            opacity: p.life,
                                            transform: `scale(${p.life})`,
                                         }}>
                                        {p.emoji}
                                    </div>
                                ))}
                                {enemies.map(enemy => (
                                    <div key={enemy.id} className="absolute transition-all duration-200 ease-linear flex justify-center items-center" 
                                         style={{ 
                                            left: enemy.position.x * GRID_SIZE, 
                                            top: enemy.position.y * GRID_SIZE, 
                                            width: enemy.type === EnemyType.WORKER ? GRID_SIZE : GRID_SIZE * 2, 
                                            height: enemy.type === EnemyType.WORKER ? GRID_SIZE : GRID_SIZE * 2,
                                         }}>
                                        {enemy.type === EnemyType.WORKER ? <span className="text-4xl">{enemiesFrozen ? '🥶' : '👷'}</span> : <ForkliftIcon className="w-full h-full" color={enemiesFrozen ? '#A5F3FC' : (enemy.isBoss ? '#DC2626' : undefined)} />}
                                    </div>
                                ))}
                                
                                {!isCaptureInProgress ? (
                                     <div className={`absolute transition-transform duration-200 ease-out flex justify-center items-center ${isHiding ? 'opacity-50' : 'opacity-100'} ${isInvulnerable ? 'animate-blink' : ''}`} style={{ 
                                        width: GRID_SIZE, 
                                        height: GRID_SIZE,
                                        transform: `translate(${playerPosition.x * GRID_SIZE}px, ${playerPosition.y * GRID_SIZE}px)`
                                     }}>
                                        <span className="text-4xl">🐱</span>
                                     </div>
                                ) : capturedPosition && (
                                    <div
                                        className="absolute z-30 capture-animation-container"
                                        style={{
                                            '--start-x': `${capturedPosition.x * GRID_SIZE}px`,
                                            '--start-y': `${capturedPosition.y * GRID_SIZE}px`,
                                            '--end-x': `${exitPosition.x * GRID_SIZE}px`,
                                            '--end-y': `${exitPosition.y * GRID_SIZE}px`,
                                        } as React.CSSProperties}
                                    >
                                        <div className="absolute text-5xl" style={{transform: 'translate(-12px, -20px)'}}>✋</div>
                                        <div className="absolute text-4xl" style={{transform: 'translate(-8px, -8px)'}}>😿</div>
                                    </div>
                                )}
                              </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            {isTouchDevice && gameState === GameState.PLAYING && <DPad onMove={handlePlayerMove} />}
            <footer className="mt-2 text-center text-gray-500 text-xs sm:text-sm hidden sm:block shrink-0">
                <p>Usa las teclas [↑ ↓ ← →] o [W A S D] para moverte.</p>
                <p>Muévete a las estanterías 🧱 para esconderte por 2 segundos.</p>
            </footer>
            <style>{`
                html, body, #root {
                    height: 100%;
                    width: 100%;
                    margin: 0;
                    padding: 0;
                    overflow: hidden;
                    touch-action: none;
                    overscroll-behavior: none;
                    -webkit-tap-highlight-color: transparent;
                    user-select: none;
                    -webkit-user-select: none;
                    -webkit-touch-callout: none;
                }
                .bg-checkered {
                    background-image: linear-gradient(45deg, #5a6678 25%, transparent 25%), linear-gradient(-45deg, #5a6678 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #5a6678 75%), linear-gradient(-45deg, transparent 75%, #5a6678 75%);
                    background-size: ${GRID_SIZE}px ${GRID_SIZE}px;
                    background-position: 0 0, 0 ${GRID_SIZE/2}px, ${GRID_SIZE/2}px -${GRID_SIZE/2}px, -${GRID_SIZE/2}px 0px;
                }
                 @keyframes fade-in-down {
                    0% { opacity: 0; transform: translateY(-20px); }
                    100% { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-down {
                    animation: fade-in-down 0.5s ease-out forwards;
                }
                @keyframes capture-move-and-fade {
                    from {
                        left: var(--start-x);
                        top: var(--start-y);
                        transform: scale(1.2);
                        opacity: 1;
                    }
                    20% {
                        transform: scale(1);
                    }
                    to {
                        left: var(--end-x);
                        top: var(--end-y);
                        transform: scale(0.5);
                        opacity: 0;
                    }
                }
                .capture-animation-container {
                    animation: capture-move-and-fade 2s ease-in forwards;
                }
                 @keyframes blink-effect {
                    50% { opacity: 0.3; }
                }
                .animate-blink {
                    animation: blink-effect 0.4s step-end infinite;
                }
            `}</style>
        </main>
    );
}

export default App;