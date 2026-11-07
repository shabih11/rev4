export type RiyadhWeather = {
  time: number;
  temperature: number;
  cloud: number;
  wind: number; // metres per second
  rain: number; // millimetres in the next hour
  symbol: string;
};
export type SeaWeather = 'clear' | 'cloudy' | 'rain' | 'storm' | 'wind';

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function parseMetForecast(payload: unknown): RiyadhWeather[] {
  const series = object(object(payload).properties).timeseries;
  if (!Array.isArray(series)) throw new Error('Invalid weather forecast');
  const points = series.slice(0, 48).map(point => {
    const row = object(point), data = object(row.data), details = object(object(data.instant).details);
    const next = object(data.next_1_hours);
    return { time: Date.parse(String(row.time)), temperature: details.air_temperature,
      cloud: details.cloud_area_fraction, wind: details.wind_speed,
      rain: object(next.details).precipitation_amount, symbol: object(next.summary).symbol_code };
  });
  return parseWeatherForecast(points);
}

export function parseWeatherForecast(payload: unknown): RiyadhWeather[] {
  if (!Array.isArray(payload)) throw new Error('Invalid weather forecast');
  const points = payload.filter((row): row is RiyadhWeather => {
    const p = object(row);
    return finite(p.time) && finite(p.temperature) && p.temperature >= -60 && p.temperature <= 65 &&
      finite(p.cloud) && p.cloud >= 0 && p.cloud <= 100 && finite(p.wind) && p.wind >= 0 && p.wind <= 150 &&
      finite(p.rain) && p.rain >= 0 && typeof p.symbol === 'string' && /^[a-z0-9_]{1,80}$/.test(p.symbol);
  }).sort((a, b) => a.time - b.time);
  if (!points.length) throw new Error('Empty weather forecast');
  return points;
}

export function weatherAt(points: readonly RiyadhWeather[], now: number): RiyadhWeather | null {
  // Never use a future interval or show an old forecast as current weather.
  const point = points.findLast(point => point.time <= now);
  return point && now - point.time < 3600000 ? point : null;
}

export function seaWeather(weather: RiyadhWeather | null): SeaWeather {
  if (!weather) return 'clear';
  if (weather.symbol.includes('thunder')) return 'storm';
  if (weather.rain >= .1 || /rain|sleet|snow/.test(weather.symbol)) return 'rain';
  if (weather.wind >= 8) return 'wind';
  return weather.cloud >= 60 ? 'cloudy' : 'clear';
}

export const WEATHER_LABELS: Record<SeaWeather, string> = {
  clear: 'سماء صافية', cloudy: 'غائم', rain: 'ممطر', storm: 'عواصف رعدية', wind: 'رياح نشطة',
};
