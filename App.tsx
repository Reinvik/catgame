
import React, { useState, useEffect, useCallback } from 'react';
import { Position, Enemy, EnemyType, GameState, Direction, FoodItem, Rack, EnemyState } from './types';
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
    const [exitPosition] = useState<Position>({ x: BOARD_WIDTH - 1, y: Math.floor(BOARD_HEIGHT / 2) });
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

    const { playSound, playMusic, stopMusic, isMuted, toggleMute } = useAudio();

    useEffect(() => {
        setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
    }, []);

    const isWall = (pos: Position) => {
        const wall = pos.x < 0 || pos.x >= BOARD_WIDTH || pos.y < 0 || pos.y >= BOARD_HEIGHT;
        return wall;
    };
    const isRack = useCallback((pos: Position) => racks.some(r => arePositionsEqual(r, pos)), [racks]);
    
    const getForkliftCellsAt = (position: Position): Position[] => {
        const cells: Position[] = [];
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
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
            // Check for walls, ensuring forklifts don't go off-screen
            if (enemy.type === EnemyType.PALLET_JACK) {
                 if (cell.x < 0 || cell.x >= BOARD_WIDTH || cell.y < 0 || cell.y >= BOARD_HEIGHT) {
                    return false;
                }
            } else {
                 if (isWall(cell)) return false;
            }
            
            if (isRack(cell)) {
                return false; // Collides with static obstacles
            }
            if (otherEnemyCells.some(otherCell => arePositionsEqual(cell, otherCell))) {
                return false; // Collides with another enemy
            }
        }
        return true;
    }, [isWall, isRack, getEnemyOccupiedCells]);

    const generateRacks = useCallback((): Rack[] => {
        const newRacks: Rack[] = [];
        const numRackRows = 4;
        const aisleHeight = 4;

        for (let i = 0; i < numRackRows; i++) {
            const y = 2 + i * aisleHeight;
            if (y >= BOARD_HEIGHT - 1) continue;

            const gapStart = Math.floor(BOARD_WIDTH / 3) + Math.floor(Math.random() * (BOARD_WIDTH / 3));
            const gapWidth = 3;

            for (let x = 1; x < BOARD_WIDTH - 1; x++) {
                if (x < gapStart || x >= gapStart + gapWidth) {
                    if (y !== exitPosition.y) {
                        newRacks.push({ x, y });
                    }
                }
            }
        }
        return newRacks;
    }, [exitPosition]);
    
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

        const enemyCount = ENEMY_BASE_COUNT + newLevel;
        const newEnemies: Enemy[] = Array.from({ length: enemyCount }, (_, i) => {
             const type = i % 2 === 0 ? EnemyType.WORKER : EnemyType.PALLET_JACK;
             const isWorker = type === EnemyType.WORKER;
             const enemy: Enemy = {
                id: Date.now() + i,
                position: { x: exitPosition.x - (isWorker ? 2 : 4), y: exitPosition.y + (i % 5 - 2) },
                type,
                speed: isWorker ? WORKER_SPEED : PALLET_JACK_SPEED,
                moveCounter: 0,
                state: isWorker ? EnemyState.PATROLLING : EnemyState.CHASING,
                patrolTarget: isWorker ? getRandomPatrolTarget(newRacks) : undefined,
            };
             // Ensure forklift is not spawning inside a wall/rack
            if (type === EnemyType.PALLET_JACK) {
                 const cells = getForkliftCellsAt(enemy.position);
                 if (cells.some(c => isWall(c) || occupiedByRacks(c))) {
                    enemy.position = { x: BOARD_WIDTH - 4, y: 1 };
                 }
            }
            return enemy;
        });
        setEnemies(newEnemies);
        
        const existingPos = [newPlayerPos, ...newEnemies.flatMap(getEnemyOccupiedCells)];
        const newFoodItems: FoodItem[] = [];
        for (let i = 0; i < FOOD_PER_LEVEL; i++) {
             let foodPos: Position;
             do {
                foodPos = {
                    x: Math.floor(Math.random() * BOARD_WIDTH),
                    y: Math.floor(Math.random() * BOARD_HEIGHT),
                };
            } while (occupiedByRacks(foodPos) || existingPos.some(p => arePositionsEqual(p, foodPos)) || arePositionsEqual(foodPos, exitPosition));
            
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
        resetLevel(1);
        setGameState(GameState.PLAYING);
        setKey(prev => prev + 1);
        setIsCaptureInProgress(false);
        playMusic();
        playSound('start');
    };
    
    const nextLevel = () => {
        const newLevel = level + 1;
        setLevel(newLevel);
        resetLevel(newLevel);
        setGameState(GameState.PLAYING);
        playMusic();
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
        
        // For forklifts, target the center of the 3x3 grid for better pathing
        const effectiveTarget = enemy.type === EnemyType.PALLET_JACK ? { x: target.x - 1, y: target.y - 1 } : target;

        const dx = effectiveTarget.x - start.x;
        const dy = effectiveTarget.y - start.y;
        
        let preferredMove: Direction | null = null;
        let fallbackMove: Direction | null = null;
        
        if (Math.abs(dx) > Math.abs(dy)) {
            preferredMove = dx > 0 ? 'right' : 'left';
            fallbackMove = dy > 0 ? 'down' : 'up';
        } else {
            preferredMove = dy > 0 ? 'down' : 'up';
            fallbackMove = dx > 0 ? 'right' : 'left';
        }

        const tryMove = (dir: Direction | null): Position | null => {
            if (!dir) return null;
            let { x, y } = start;
            if (dir === 'up') y--; if (dir === 'down') y++; if (dir === 'left') x--; if (dir === 'right') x++;
            if (!isMoveValid(enemy, {x, y}, allEnemies)) return null;
            return { x, y };
        };

        let nextPos = tryMove(preferredMove);
        if (nextPos) return nextPos;

        nextPos = tryMove(fallbackMove);
        if (nextPos) return nextPos;
        
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

                let currentEnemy = { ...enemy, moveCounter: 0 };
                let newPosition = currentEnemy.position;
                let newPatrolTarget = currentEnemy.patrolTarget;
                let newState = currentEnemy.state;

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
                } else { // PALLET_JACK
                    const target = isHiding ? lastKnownPlayerPosition : playerPosition;
                    newPosition = getNextStep(currentEnemy.position, target, currentEnemy, prevEnemies);
                }

                return { ...currentEnemy, position: newPosition, state: newState, patrolTarget: newPatrolTarget };
            });
        });
        
        const remainingFood = foodItems.filter(food => !arePositionsEqual(playerPosition, food.position));
        if (remainingFood.length < foodItems.length) {
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

                        // Start invulnerability
                        setIsInvulnerable(true);
                        playSound('respawn');
                        if (invulnerabilityTimeoutId) clearTimeout(invulnerabilityTimeoutId);
                        const timeout = setTimeout(() => {
                            setIsInvulnerable(false);
                            setInvulnerabilityTimeoutId(null);
                        }, 5000); // 5 seconds
                        setInvulnerabilityTimeoutId(timeout);
                    } else {
                        setGameState(GameState.GAME_OVER);
                        playSound('gameOver');
                        stopMusic();
                    }
                }, 2000); // Animation duration
            }
        }

        if (allFoodCollected && arePositionsEqual(playerPosition, exitPosition)) {
            setGameState(GameState.LEVEL_COMPLETE);
            playSound('levelComplete');
            stopMusic();
        }

    }, [gameState, playerPosition, foodItems, enemies, lives, getNextStep, isHiding, allFoodCollected, exitPosition, lastKnownPlayerPosition, hideTimeoutId, racks, getRandomPatrolTarget, isCaptureInProgress, playSound, stopMusic, getEnemyOccupiedCells, isInvulnerable, invulnerabilityTimeoutId]);

    useEffect(() => {
        if (gameState === GameState.PLAYING) {
            const interval = setInterval(gameLoop, BASE_GAME_TICK);
            return () => clearInterval(interval);
        }
    }, [gameState, gameLoop]);
    
    const renderModal = () => {
        switch (gameState) {
            case GameState.NOT_STARTED:
                return (
                    <Modal title="🐱 Gato en el Centro de Distribución" buttonText="¡Empezar a Jugar!" onButtonClick={startGame}>
                        <p>¡Ayuda al gato a conseguir <strong>{FOOD_PER_LEVEL} comidas</strong> y luego escapar!</p>
                        <p className="font-bold">⌨️ Usa las flechas para moverte.</p>
                        <p>📱 En móvil, usa los controles en pantalla.</p>
                        <p>🧱 ¡Puedes <strong>esconderte</strong> en las estanterías por 2 segundos!</p>
                        <p>👷 Los operarios tienen su propia rutina. ¡No los molestes!</p>
                        <p className="flex items-center justify-center gap-2">
                           <ForkliftIcon className="w-24 h-24" /> 
                           <span>Las traspaletas son enormes (3x3). ¡Cuidado!</span>
                        </p>
                        <p>🚚 Después de comer, ¡corre a la salida!</p>
                    </Modal>
                );
            case GameState.LEVEL_COMPLETE:
                return (
                    <Modal title={`¡Nivel ${level} Superado!`} buttonText={`Ir al Nivel ${level + 1}`} onButtonClick={nextLevel}>
                        <p>¡El gato escapó! Pero el próximo almacén es más grande...</p>
                        <p className="text-5xl my-4">🎉</p>
                    </Modal>
                );
            case GameState.GAME_OVER:
                return (
                    <Modal title="😿 Fin del Juego" buttonText="Intentar de Nuevo" onButtonClick={startGame}>
                        <p>¡Oh no! El gato ha sido atrapado y escoltado fuera.</p>
                        <p>Has alcanzado el nivel {level}.</p>
                    </Modal>
                );
            default:
                return null;
        }
    };
    
    const loadingDockPositions = [
        { x: exitPosition.x, y: exitPosition.y - 1 },
        { x: exitPosition.x, y: exitPosition.y },
        { x: exitPosition.x, y: exitPosition.y + 1 },
    ];

    return (
        <main className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4 font-mono">
            <h1 className="text-3xl font-bold mb-2 text-yellow-400">Gato en el Centro de Distribución</h1>
            <p className="mb-4 text-gray-400">¡Esquiva, come, escóndete y escapa!</p>
            
            <div className="bg-gray-800 p-2 rounded-lg shadow-lg">
                <div className="flex justify-between items-center bg-gray-900 text-white p-2 rounded-t-md text-xl font-bold w-full">
                    <div>Nivel: {level}</div>
                    <div>Comida: {FOOD_PER_LEVEL - foodItems.length}/{FOOD_PER_LEVEL}</div>
                    <div className="flex items-center space-x-4">
                        <button onClick={toggleMute} className="text-2xl hover:scale-110 transition-transform focus:outline-none" aria-label={isMuted ? 'Activar sonido' : 'Silenciar'}>
                            {isMuted ? '🔇' : '🔊'}
                        </button>
                        <div className="flex items-center space-x-2">
                        {Array.from({ length: lives }).map((_, i) => (
                           <span key={i} className="text-red-500 text-2xl animate-pulse">❤️</span>
                        ))}
                        </div>
                    </div>
                </div>
                
                <div
                  key={key}
                  className="relative bg-gray-600 bg-checkered overflow-hidden"
                  style={{ width: BOARD_WIDTH * GRID_SIZE, height: BOARD_HEIGHT * GRID_SIZE }}
                >
                    {renderModal()}
                    {gameMessage && <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/60 text-white px-4 py-2 rounded-lg z-20 text-center animate-pulse">{gameMessage}</div>}
                    
                    {gameState !== GameState.NOT_STARTED && (
                      <>
                        {loadingDockPositions.map((pos, i) => (
                            <div key={`dock-${i}`} className="absolute bg-gray-700/80 border-l-4 border-yellow-400" style={{ left: pos.x * GRID_SIZE, top: pos.y * GRID_SIZE, width: GRID_SIZE, height: GRID_SIZE, boxSizing: 'border-box' }}></div>
                        ))}
                        {racks.map((rack, i) => (
                             <div key={`rack-${i}`} className="absolute bg-gray-700 border-t border-gray-500" style={{ left: rack.x * GRID_SIZE, top: rack.y * GRID_SIZE, width: GRID_SIZE, height: GRID_SIZE, boxSizing: 'border-box' }}></div>
                        ))}
                        <div className="absolute text-4xl z-10 flex justify-center items-center" style={{ left: exitPosition.x * GRID_SIZE, top: exitPosition.y * GRID_SIZE, width: GRID_SIZE, height: GRID_SIZE }}>{EXIT_EMOJI}</div>
                        {foodItems.map(food => (
                            <div key={food.id} className="absolute text-4xl animate-bounce flex justify-center items-center" style={{ left: food.position.x * GRID_SIZE, top: food.position.y * GRID_SIZE, width: GRID_SIZE, height: GRID_SIZE }}>{food.emoji}</div>
                        ))}
                        {enemies.map(enemy => (
                            <div key={enemy.id} className="absolute transition-all duration-200 ease-linear flex justify-center items-center" 
                                 style={{ 
                                    left: enemy.position.x * GRID_SIZE, 
                                    top: enemy.position.y * GRID_SIZE, 
                                    width: enemy.type === EnemyType.WORKER ? GRID_SIZE : GRID_SIZE * 3, 
                                    height: enemy.type === EnemyType.WORKER ? GRID_SIZE : GRID_SIZE * 3,
                                 }}>
                                {enemy.type === EnemyType.WORKER ? <span className="text-4xl">👷</span> : <ForkliftIcon className="w-full h-full" />}
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
            {isTouchDevice && gameState === GameState.PLAYING && <DPad onMove={handlePlayerMove} />}
            <footer className="mt-6 text-center text-gray-500 text-sm">
                <p>Usa las teclas [↑ ↓ ← →] o [W A S D] para moverte.</p>
                <p>Muévete a las estanterías 🧱 para esconderte por 2 segundos.</p>
            </footer>
            <style>{`
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
