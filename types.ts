export type Position = {
  x: number;
  y: number;
};

export enum EnemyType {
  WORKER = 'WORKER',
  PALLET_JACK = 'PALLET_JACK',
}

export enum EnemyState {
  PATROLLING,
  CHASING,
  FROZEN,
}

export type Enemy = {
  id: number;
  position: Position;
  type: EnemyType;
  patrolTarget?: Position;
  speed: number;
  moveCounter: number;
  state: EnemyState;
  pathHistory?: Position[];
  isBoss?: boolean;
};

export enum GameState {
  NOT_STARTED = 'NOT_STARTED',
  PLAYING = 'PLAYING',
  LEVEL_COMPLETE = 'LEVEL_COMPLETE',
  GAME_OVER = 'GAME_OVER',
  BOSS_LEVEL_START = 'BOSS_LEVEL_START',
  CREDITS = 'CREDITS',
  PAUSED = 'PAUSED', // New state
}

export type Direction = 'up' | 'down' | 'left' | 'right';

export type FoodItem = {
    id: number;
    position: Position;
    emoji: string;
}

export enum PowerUpType {
  FREEZE_ENEMIES = 'FREEZE_ENEMIES',
}

export type PowerUp = {
    id: number;
    position: Position;
    type: PowerUpType;
}

export type Rack = Position;

export type HighScoreEntry = {
  name: string;
  level: number;
  food: number;
};

export type Particle = {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    emoji: string;
    life: number; // 0 to 1
    color?: string;
}
