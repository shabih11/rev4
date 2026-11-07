import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './helpers/typescript.mjs';
const { parseMetForecast, parseWeatherForecast, weatherAt, seaWeather } = await import(moduleUrl('riyadhWeather'));
const time = Date.parse('2026-11-05T09:00:00Z');
const point = { time, temperature: 28, cloud: 20, wind: 3, rain: 0, symbol: 'fair_day' };

test('MET hourly data is normalized, sorted and rejects malformed or incomplete values', () => {
  const payload = { properties: { timeseries: [{ time: new Date(time).toISOString(), data: {
    instant: { details: { air_temperature: 28, cloud_area_fraction: 20, wind_speed: 3 } },
    next_1_hours: { summary: { symbol_code: 'fair_day' }, details: { precipitation_amount: 0 } },
  } }] } };
  assert.deepEqual(parseMetForecast(payload), [point]);
  assert.throws(() => parseMetForecast({}));
  assert.throws(() => parseWeatherForecast([{ ...point, wind: NaN }, { ...point, cloud: 120 }, { ...point, rain: undefined }]));
  assert.deepEqual(parseWeatherForecast([{ ...point, time: time + 3600000 }, point]).map(p => p.time), [time, time + 3600000]);
});

test('only the current hour is used; stale and future forecasts never pose as live weather', () => {
  assert.equal(weatherAt([point], time - 1), null);
  assert.deepEqual(weatherAt([point], time), point);
  assert.deepEqual(weatherAt([point], time + 3599999), point);
  assert.equal(weatherAt([point], time + 3600000), null);
  assert.equal(weatherAt([], time), null);
});

test('weather effects prioritize thunder and precipitation over wind and clouds', () => {
  assert.equal(seaWeather(point), 'clear');
  assert.equal(seaWeather({ ...point, cloud: 60 }), 'cloudy');
  assert.equal(seaWeather({ ...point, wind: 8, cloud: 90 }), 'wind');
  assert.equal(seaWeather({ ...point, rain: .1, wind: 12 }), 'rain');
  assert.equal(seaWeather({ ...point, symbol: 'rainshowers_day' }), 'rain');
  assert.equal(seaWeather({ ...point, symbol: 'rainandthunder' }), 'storm');
  assert.equal(seaWeather(null), 'clear');
});
