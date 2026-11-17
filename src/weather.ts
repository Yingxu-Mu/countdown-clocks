export type WeatherHour = {
  time: number
  temperature: number
  code: number
  precip: number
}

export type LocalForecast = {
  place: string
  unit: '°F' | '°C'
  hours: WeatherHour[]
}

const HOURS = 6

export function prefersFahrenheit(): boolean {
  const language = navigator.language.toLowerCase()
  return language === 'en-us' || language.endsWith('-us') || language === 'en-lr' || language === 'en-mm'
}

export function weatherKind(code: number): string {
  if (code === 0) return 'Clear'
  if (code === 1 || code === 2) return 'Partly cloudy'
  if (code === 3) return 'Cloudy'
  if (code === 45 || code === 48) return 'Fog'
  if (code >= 51 && code <= 57) return 'Drizzle'
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'Rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'Snow'
  if (code >= 95) return 'Thunderstorm'
  return 'Weather'
}

export async function loadLocalForecast(position: GeolocationPosition): Promise<LocalForecast> {
  const { latitude, longitude } = position.coords
  const fahrenheit = prefersFahrenheit()
  const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast')
  forecastUrl.searchParams.set('latitude', String(latitude))
  forecastUrl.searchParams.set('longitude', String(longitude))
  forecastUrl.searchParams.set('hourly', 'temperature_2m,weather_code,precipitation_probability')
  forecastUrl.searchParams.set('forecast_hours', '18')
  forecastUrl.searchParams.set('timezone', 'auto')
  forecastUrl.searchParams.set('temperature_unit', fahrenheit ? 'fahrenheit' : 'celsius')

  const placeUrl = new URL('https://geocoding-api.open-meteo.com/v1/reverse')
  placeUrl.searchParams.set('latitude', String(latitude))
  placeUrl.searchParams.set('longitude', String(longitude))
  placeUrl.searchParams.set('language', 'en')

  const [forecastResponse, placeResponse] = await Promise.all([
    fetch(forecastUrl),
    fetch(placeUrl),
  ])
  if (!forecastResponse.ok) throw new Error('forecast unavailable')

  const forecast = (await forecastResponse.json()) as {
    hourly?: {
      time?: string[]
      temperature_2m?: number[]
      weather_code?: number[]
      precipitation_probability?: number[]
    }
  }
  const times = forecast.hourly?.time ?? []
  const temperatures = forecast.hourly?.temperature_2m ?? []
  const codes = forecast.hourly?.weather_code ?? []
  const precips = forecast.hourly?.precipitation_probability ?? []
  const now = Date.now()
  const hours: WeatherHour[] = []

  for (let index = 0; index < times.length && hours.length < HOURS; index += 1) {
    const stamp = times[index]
    const temperature = temperatures[index]
    const code = codes[index]
    if (!stamp || temperature === undefined || code === undefined) continue
    const time = new Date(stamp).getTime()
    if (!Number.isFinite(time) || time + 60 * 60 * 1000 <= now) continue
    hours.push({
      time,
      temperature,
      code,
      precip: precips[index] ?? 0,
    })
  }

  if (hours.length === 0) throw new Error('forecast empty')

  let place = 'Nearby'
  if (placeResponse.ok) {
    const places = (await placeResponse.json()) as { results?: { name?: string }[] }
    const name = places.results?.[0]?.name
    if (name) place = name
  }

  return { place, unit: fahrenheit ? '°F' : '°C', hours }
}
