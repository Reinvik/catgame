import React, { useState, useEffect, useCallback } from 'react';
import { Position, Enemy, EnemyType, GameState, Direction, FoodItem, Rack, EnemyState, HighScoreEntry } from './types';
import { BOARD_WIDTH, BOARD_HEIGHT, GRID_SIZE, INITIAL_LIVES, BASE_GAME_TICK, FOOD_PER_LEVEL, FOOD_EMOJIS, ENEMY_BASE_COUNT, HIDING_DURATION_MS, EXIT_EMOJI, WORKER_SPEED, PALLET_JACK_SPEED, WORKER_VISION_RANGE } from './constants';
import Modal from './components/Modal';
import ForkliftIcon from './components/ForkliftIcon';
import { useAudio } from './hooks/useAudio';

const arePositionsEqual = (pos1: Position, pos2: Position) => pos1.x === pos2.x && pos1.y === pos2.y;

// --- Componente D-Pad para Móviles ---
interface DPadProps {
  onMove: (direction: Direction) => void;
}

const DPad: React.FC<DPadProps> = ({ onMove }) => {
  const handleTouch = (e: React.TouchEvent, direction: Direction) => {
    e.preventDefault(); // Evita el zoom o el desplazamiento de la página
    onMove(direction);
  };

  const buttonClasses = "absolute bg-gray-600/70 rounded-full w-16 h-16 flex justify-center items-center text-3xl text-white active:bg-yellow-500/80 transform active:scale-110 transition-transform select-none";
  const arrowClasses = "pointer-events-none";

  return (
    <div
      className="fixed bottom-5 left-5 z-[100] w-48 h-48 select-none"
      aria-label="Controles direccionales"
      role="group"
    >
      <button onTouchStart={(e) => handleTouch(e, 'up')} className={buttonClasses} style={{ top: 0, left: '50%', transform: 'translateX(-50%)' }} aria-label="Mover hacia arriba"><span className={arrowClasses}>▲</span></button>
      <button onTouchStart={(e) => handleTouch(e, 'down')} className={buttonClasses} style={{ bottom: 0, left: '50%', transform: 'translateX(-50%)' }} aria-label="Mover hacia abajo"><span className={arrowClasses}>▼</span></button>
      <button onTouchStart={(e) => handleTouch(e, 'left')} className={buttonClasses} style={{ left: 0, top: '50%', transform: 'translateY(-50%)' }} aria-label="Mover hacia la izquierda"><span className={arrowClasses}>◀</span></button>
      <button onTouchStart={(e) => handleTouch(e, 'right')} className={buttonClasses} style={{ right: 0, top: '50%', transform: 'translateY(-50%)' }} aria-label="Mover hacia la derecha"><span className={arrowClasses}>▶</span></button>
    </div>
  );
};


const App: React.FC = () => {
    const [gameState, setGameState] = useState<GameState>(GameState.NOT_STARTED);
    const [lives, setLives] = useState<number>(INITIAL_LIVES);
    const [level, setLevel] = useState<number>(1);
    const [playerPosition, setPlayerPosition] = useState<Position>({ x: 1, y: 1 });
    const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
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

    const [isInvulnerable, setIsInvulnerable] = useState<boolean>(false);
    const [invulnerabilityTimeoutId, setInvulnerabilityTimeoutId] = useState<ReturnType<typeof setTimeout> | null>(null);
    const [isTouchDevice, setIsTouchDevice] = useState<boolean>(false);
    const [isFullscreen, setIsFullscreen] = useState<boolean>(!!document.fullscreenElement);

    const { playSound, playMusic, stopMusic, isMuted, toggleMute } = useAudio();
    
    // --- Sistema de Puntuación Histórica ---
    const [playerName, setPlayerName] = useState<string>('');
    const [totalFood, setTotalFood] = useState(0);
    const [leaderboard, setLeaderboard] = useState<HighScoreEntry[]>([]);


    // Cargar puntuación al inicio
    useEffect(() => {
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
        } catch (error) {
            console.error("Fallo al cargar la tabla de récords desde localStorage", error);
        }
    }, []);

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

    }, [exitPosition, generateRacks, getRandomPatrolTarget, hideTimeoutId, getEnemyOccupiedCells, invulnerabilityTimeoutId]);

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

    const returnToMenu = () => {
        setGameState(GameState.NOT_STARTED);
    };

    const handlePlayerMove = useCallback((direction: Direction) => {
        if (gameState !== GameState.PLAYING || isCaptureInProgress) return;
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
    }, [gameState, isRack, hideTimeoutId, isWall, isCaptureInProgress, playSound]);

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


    const gameLoop = useCallback(() => {
        if (gameState !== GameState.PLAYING || isCaptureInProgress) return;

        if (!isHiding) {
            setLastKnownPlayerPosition(playerPosition);
        }

        setEnemies(prevEnemies => {
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
            setFoodItems(remainingFood);
            if (remainingFood.length === 0 && !allFoodCollected) {
                 setAllFoodCollected(true);
                 setGameMessage(`¡Comida recogida! ¡Corre a la salida ${EXIT_EMOJI}!`);
            }
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

    }, [gameState, playerPosition, foodItems, enemies, lives, getNextStep, isHiding, allFoodCollected, exitPosition, lastKnownPlayerPosition, hideTimeoutId, racks, getRandomPatrolTarget, isCaptureInProgress, playSound, stopMusic, getEnemyOccupiedCells, isInvulnerable, invulnerabilityTimeoutId, totalFood, level, leaderboard, playerName]);

    useEffect(() => {
        if (gameState === GameState.PLAYING) {
            const interval = setInterval(gameLoop, BASE_GAME_TICK);
            return () => clearInterval(interval);
        }
    }, [gameState, gameLoop]);
    
    const renderModal = () => {
        const buttonClass = "bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold py-3 px-6 rounded-lg text-lg transition-transform transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-yellow-300 w-full sm:w-auto";
        const bossButtonClass = "bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg text-lg transition-transform transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-red-400 w-full sm:w-auto";

        switch (gameState) {
            case GameState.NOT_STARTED:
                return (
                    <Modal title="🐱 Gato en el Centro de Distribución">
                        <div className="mb-4">
                            <label htmlFor="playerName" className="block text-lg font-bold mb-2">Ingresa tu nombre (opcional):</label>
                            <input
                              id="playerName"
                              type="text"
                              value={playerName}
                              onChange={(e) => setPlayerName(e.target.value)}
                              placeholder="Gato Anónimo"
                              maxLength={15}
                              className="w-full p-2 rounded bg-gray-800 border border-gray-600 text-white text-center focus:outline-none focus:ring-2 focus:ring-yellow-400"
                            />
                        </div>
                        {leaderboard.length > 0 && (
                            <div className="mb-4 p-3 bg-gray-800 rounded-lg border border-yellow-500">
                                <h3 className="text-xl font-bold text-yellow-300 mb-2">🏆 El Gato Más Glotón 🏆</h3>
                                <ol className="text-left text-sm max-h-40 overflow-y-auto pr-2">
                                    {leaderboard.map((score, index) => (
                                    <li key={index} className="flex justify-between p-1 border-b border-gray-700 last:border-b-0">
                                        <span className="font-bold mr-2">{index + 1}. {score.name}</span>
                                        <span className="text-gray-300">Nvl: {score.level} / Comida: {score.food}</span>
                                    </li>
                                    ))}
                                </ol>
                            </div>
                        )}
                        <p>¡Ayuda al gato a conseguir <strong>{FOOD_PER_LEVEL} comidas</strong> y luego escapar!</p>
                        <p>🧱 ¡Puedes <strong>esconderte</strong> en las estanterías por 2 segundos!</p>
                         <p className="flex items-center justify-center gap-2">
                           <ForkliftIcon className="w-16 h-16" /> 
                           <span>Las traspaletas miden (2x2). ¡Cuidado!</span>
                        </p>
                        <p>🚚 Después de comer, ¡corre a la salida!</p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
                            <button onClick={startGame} className={buttonClass}>¡Empezar a Jugar!</button>
                            <button onClick={startBossFight} className={bossButtonClass}>Jefe Final</button>
                        </div>
                    </Modal>
                );
            case GameState.BOSS_LEVEL_START:
                return (
                    <Modal title="🚨 ¡ALERTA DE JEFE! 🚨">
                         <p className="text-2xl italic text-red-400">"¡Maldito gato, te atraparé!"</p>
                         <p>El jefe de turno te perseguirá sin descanso en su traspaleta roja.</p>
                         <div className="mt-6">
                            <button onClick={() => { setGameState(GameState.PLAYING); playMusic(); }} className={buttonClass}>
                                ¡Comenzar Nivel 10!
                            </button>
                        </div>
                    </Modal>
                );
            case GameState.CREDITS:
                return (
                    <Modal title="¡VICTORIA!">
                        <p className="text-xl mb-4">¡El gato ha escapado y encontrado un lugar seguro junto a su nueva descendencia!</p>
                        <p className="text-4xl my-4">🐱 ❤️ 🐱🐱🐱🐱</p>
                        <p className="text-xl italic text-gray-300 mb-6">"Nuestro Gato ahora adiestrará a sus 4 pequeños".</p>
                        <div className="mt-8">
                            <button onClick={returnToMenu} className={buttonClass}>
                                Volver al Menú
                            </button>
                        </div>
                    </Modal>
                );
            case GameState.LEVEL_COMPLETE:
                return (
                    <Modal title={`¡Nivel ${level} Superado!`} >
                        <p>¡El gato escapó! Pero el próximo almacén es más grande...</p>
                        <p className="text-5xl my-4">🎉</p>
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
                        <p>¡Oh no! El gato ha sido atrapado y escoltado fuera.</p>
                        <p>Alcanzaste el nivel <strong>{level}</strong> y recogiste <strong>{totalFood}</strong> comidas.</p>
                        {leaderboard.length > 0 && (
                             <div className="mt-4 p-3 bg-gray-600 rounded-lg">
                                <h3 className="text-lg font-bold text-yellow-300">🏆 El Gato Más Glotón 🏆</h3>
                                <ol className="text-left text-sm max-h-48 overflow-y-auto pr-2">
                                  {leaderboard.map((score, index) => (
                                     <li key={index} className={`flex justify-between p-1 rounded ${score.name === finalName && score.level === level && score.food === totalFood ? 'bg-yellow-500/30' : ''}`}>
                                         <span>{index + 1}. {score.name}</span>
                                         <span>Nvl: {score.level} / Com: {score.food}</span>
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

    useEffect(() => {
        const handleResize = () => {
            if (containerRef.current && headerRef.current) {
                const { width: containerWidth, height: containerHeight } = containerRef.current.getBoundingClientRect();
                const headerHeight = headerRef.current.offsetHeight;
                const availableHeight = containerHeight - headerHeight;

                const gameWidth = BOARD_WIDTH * GRID_SIZE;
                const gameHeight = BOARD_HEIGHT * GRID_SIZE;
                
                const scaleX = containerWidth / gameWidth;
                const scaleY = availableHeight / gameHeight;
                
                setScale(Math.max(0.1, Math.min(scaleX, scaleY, 1)));
            }
        };

        handleResize();
        const resizeObserver = new ResizeObserver(handleResize);
        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }
        if (headerRef.current) {
             resizeObserver.observe(headerRef.current);
        }
        
        return () => resizeObserver.disconnect();
    }, []);

    const scaledWidth = BOARD_WIDTH * GRID_SIZE;
    const scaledHeight = BOARD_HEIGHT * GRID_SIZE;
    
    const gameWrapperWidth = scaledWidth * scale;
    const gameWrapperHeight = scaledHeight * scale;

    return (
        <main className="flex flex-col items-center justify-center h-dvh w-screen bg-gray-900 text-white p-2 sm:p-4 font-mono overflow-hidden">
            <header className="text-center mb-2 sm:mb-4 shrink-0 font-sans">
                <h1 className="text-3xl sm:text-5xl font-extrabold text-yellow-400 tracking-wider [text-shadow:_2px_2px_4px_rgb(0_0_0_/_50%)]">
                    🐾 Gato en el Centro de Distribución 🐾
                </h1>
                <p className="text-lg sm:text-xl text-gray-300 italic mt-2 tracking-wide">
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
                    className="bg-gray-800 p-1 sm:p-2 rounded-lg shadow-lg flex flex-col items-center justify-center transition-all duration-300"
                    style={{ 
                        visibility: gameState === GameState.NOT_STARTED || gameState === GameState.CREDITS ? 'hidden' : 'visible'
                    }}
                >
                    <div ref={headerRef} className="flex justify-between items-center bg-gray-900 text-white p-2 rounded-t-md text-xs sm:text-base md:text-xl font-bold w-full flex-wrap gap-x-2 gap-y-1" style={{ width: gameWrapperWidth }}>
                        <div className="whitespace-nowrap">Nivel: {level}</div>
                        <div className="whitespace-nowrap">Comida: {FOOD_PER_LEVEL - foodItems.length}/{FOOD_PER_LEVEL}</div>
                        <div className="whitespace-nowrap">🏆: {leaderboard.length > 0 ? `${leaderboard[0].level}/${leaderboard[0].food}` : '0/0'}</div>
                        <div className="flex items-center space-x-2 sm:space-x-4 ml-auto">
                            <button onClick={toggleFullscreen} className="text-lg sm:text-2xl hover:scale-110 transition-transform focus:outline-none" aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}>
                                {isFullscreen ? '↘' : '⛶'}
                            </button>
                            <button onClick={toggleMute} className="text-lg sm:text-2xl hover:scale-110 transition-transform focus:outline-none" aria-label={isMuted ? 'Activar sonido' : 'Silenciar'}>
                                {isMuted ? '🔇' : '🔊'}
                            </button>
                            <div className="flex items-center space-x-1 sm:space-x-2">
                            {Array.from({ length: lives }).map((_, i) => (
                               <span key={i} className="text-red-500 text-lg sm:text-2xl animate-pulse">❤️</span>
                            ))}
                            </div>
                        </div>
                    </div>
                    
                    <div
                      key={key}
                      className="relative bg-gray-600 bg-checkered overflow-hidden"
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
                                {enemies.map(enemy => (
                                    <div key={enemy.id} className="absolute transition-all duration-200 ease-linear flex justify-center items-center" 
                                         style={{ 
                                            left: enemy.position.x * GRID_SIZE, 
                                            top: enemy.position.y * GRID_SIZE, 
                                            width: enemy.type === EnemyType.WORKER ? GRID_SIZE : GRID_SIZE * 2, 
                                            height: enemy.type === EnemyType.WORKER ? GRID_SIZE : GRID_SIZE * 2,
                                         }}>
                                        {enemy.type === EnemyType.WORKER ? <span className="text-4xl">👷</span> : <ForkliftIcon className="w-full h-full" color={enemy.isBoss ? '#DC2626' : undefined} />}
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
};

export default App;
