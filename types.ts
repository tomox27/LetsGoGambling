export enum Rarity {
  COMMON = 'COMMON', // +0, +1, +3
  RARE = 'RARE',     // +5
  LEGENDARY = 'LEGENDARY' // +10
}

export interface DrawResult {
  id: string;
  amount: number;
  rarity: Rarity;
  timestamp: number;
  wasDoubled?: boolean;
  wasShielded?: boolean;
}

export interface Buff {
  id: string;
  name: string;
  description: string;
  durationSeconds: number; // 0 if permanent (like upgrades)
  expiresAt?: number; // timestamp
  cost: number;
  icon: string;
  type: 'LUCK' | 'SPEED' | 'DOUBLE' | 'SHIELD';
}

export interface Rank {
  threshold: number;
  title: string;
}

export interface GameState {
  draws: number;
  highestDraws: number;
  history: DrawResult[];
  activeBuffs: Buff[];
  speedUpLevel: number; // How many times time-reduction was bought
  lastFreeDrawTime: number; // timestamp
  timeToNextDraw: number; // seconds remaining
  stats: {
    totalPulls: number;
    totalEarned: number;
  }
}