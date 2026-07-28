import { Color3 } from '@babylonjs/core';

/** 馬力歐派對風擂台色盤（鮮豔塑膠感，獨立於 Quaternius 原色） */
export const PARTY_ARENA_PALETTE = {
  sky: Color3.FromHexString('#7EC8F0'),
  skyDeep: Color3.FromHexString('#5BB4E8'),
  water: Color3.FromHexString('#3DB8E8'),
  waterDeep: Color3.FromHexString('#2A9FCF'),
  grass: Color3.FromHexString('#5FCB6A'),
  grassDark: Color3.FromHexString('#3FAE55'),
  meadow: Color3.FromHexString('#7AD86A'),
  platformSide: Color3.FromHexString('#C4782A'),
  trimGold: Color3.FromHexString('#F2C94C'),
  trimWhite: Color3.FromHexString('#FFF8E8'),
  stripeA: Color3.FromHexString('#F2556D'),
  stripeB: Color3.FromHexString('#FFF8E8'),
  star: Color3.FromHexString('#FFE566'),
  starRim: Color3.FromHexString('#F0A830'),
  cloud: Color3.FromHexString('#FFF8FC'),
  player1: Color3.FromHexString('#E86B8A'),
  player2: Color3.FromHexString('#9B7FD4'),
  player3: Color3.FromHexString('#6BA8E8'),
  player4: Color3.FromHexString('#7ECF9A'),
  accent: Color3.FromHexString('#9B7FD4'),
  pole: Color3.FromHexString('#F2C94C'),
} as const;

export const PARTY_ARENA_PLAYER_COLORS = [
  PARTY_ARENA_PALETTE.player1,
  PARTY_ARENA_PALETTE.player2,
  PARTY_ARENA_PALETTE.player3,
  PARTY_ARENA_PALETTE.player4,
] as const;
