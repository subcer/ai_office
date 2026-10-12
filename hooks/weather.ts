// 天色跟著電腦的時鐘走；天氣每個整點隨機換一次（同一個小時內固定，不用另外存）。

import { rng } from './pixel'

export type Phase = 'dawn' | 'day' | 'dusk' | 'night'
export type Weather = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog'
export type Env = { phase: Phase; weather: Weather }

export const PHASE_NAMES: Record<Phase, string> = { dawn: '清晨', day: '白天', dusk: '黃昏', night: '深夜' }
export const WEATHER_NAMES: Record<Weather, string> = { clear: '晴', cloudy: '多雲', rain: '下雨', storm: '雷雨', fog: '起霧' }

/** 每種天氣的機率 */
const WEIGHTS: [Weather, number][] = [['clear', 0.25], ['cloudy', 0.2], ['rain', 0.3], ['storm', 0.1], ['fog', 0.15]]

export function envAt(now: number): Env {
  const d = new Date(now)
  const h = d.getHours() + d.getMinutes() / 60
  const phase: Phase = h >= 5 && h < 7 ? 'dawn' : h >= 7 && h < 17 ? 'day' : h >= 17 && h < 19 ? 'dusk' : 'night'
  let roll = rng(Math.floor(now / 3600000) * 7919)()
  let weather: Weather = 'rain'
  for (const [w, p] of WEIGHTS) {
    if (roll < p) {
      weather = w
      break
    }
    roll -= p
  }
  return { phase, weather }
}

export const isWet = (w: Weather) => w === 'rain' || w === 'storm'
