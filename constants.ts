
import { Rank, Buff, Rarity } from './types';

export const BASE_FREE_DRAW_INTERVAL = 60; // seconds
export const MIN_FREE_DRAW_INTERVAL = 10; // seconds

export const RANKS: Rank[] = [
  { threshold: 0, title: "Beggar" },
  { threshold: 10, title: "Rookie Roller" },
  { threshold: 25, title: "Coin Flipper" },
  { threshold: 50, title: "Slot Squire" },
  { threshold: 100, title: "Dice Dealer" },
  { threshold: 200, title: "Pit Boss" },
  { threshold: 350, title: "High Roller" },
  { threshold: 500, title: "Jackpot Baron" },
  { threshold: 750, title: "Royal Gambler" },
  { threshold: 1000, title: "Immortal Draw King" },
  { threshold: 1500, title: "Mythic House" },
  { threshold: 2500, title: "Gacha God" },
  { threshold: 5000, title: "Entropy Master" },
];

export const AVAILABLE_BUFFS: Buff[] = [
  {
    id: 'luck_boost',
    name: 'Fortune\'s Favor',
    description: 'Increases EV to 1.1 (More wins) for 30 seconds.',
    durationSeconds: 30,
    cost: 50,
    icon: '✨',
    type: 'LUCK'
  },
  {
    id: 'speed_upgrade',
    name: 'Time Warp',
    description: 'Permanently reduce time for free draw by 1s (Max -50s).',
    durationSeconds: 0, // Permanent
    cost: 10,
    icon: '⏳',
    type: 'SPEED'
  },
  {
    id: 'double_reward',
    name: 'Double Down',
    description: '10% chance to double any positive draw reward for 30 seconds.',
    durationSeconds: 30,
    cost: 30,
    icon: '🎲',
    type: 'DOUBLE'
  },
  {
    id: 'streak_shield',
    name: 'Safety Net',
    description: 'Guarantees at least 1 draw return for the next 5 spins.',
    durationSeconds: 0, // Charge based
    charges: 5,
    cost: 25,
    icon: '🛡️',
    type: 'SHIELD'
  }
];

export const RARITY_COLORS = {
  [Rarity.COMMON]: 'text-blue-400 border-blue-400/30 bg-blue-500/10 shadow-blue-500/20',
  [Rarity.RARE]: 'text-purple-400 border-purple-400/30 bg-purple-500/10 shadow-purple-500/20',
  [Rarity.LEGENDARY]: 'text-yellow-400 border-yellow-400/30 bg-yellow-500/10 shadow-yellow-500/20',
};
