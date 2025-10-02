// API keys (replace with your own!)
const OPENWEATHER_API_KEY = '3816398024e55202aff980be0b65c700';
const AIRVISUAL_API_KEY = '961064f3-bcb2-492e-9ce8-7c4394b31699';

// Utility: debounce
function debounce(fn, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}

// DOM refs
const locationForm = document.getElementById('location-form');
const locationInput = document.getElementById('location-input');
const geoBtn = document.getElementById('geo-btn');
const loadingIndicator = document.getElementById('loading-indicator');
const errorMessage = document.getElementById('error-message');
const weatherDisplay = document.getElementById('weather-display');
const hourlyForecast = document.getElementById('hourly-forecast');
const weeklyForecast = document.getElementById('weekly-forecast');
const airQuality = document.getElementById('air-quality');
const alertsDisplay = document.getElementById('alerts-display');
const historicalDisplay = document.getElementById('historical-display');
const citiesList = document.getElementById('cities-list');
const darkModeToggle = document.getElementById('dark-mode-toggle');
const mapDisplay = document.getElementById('map-display');

// State
let savedCities = JSON.parse(localStorage.getItem('weatherAppCities') || '[]');
let darkMode = localStorage.getItem('weatherAppDarkMode') === 'true';

// Accessibility: update theme
function setDarkMode(enabled) {
  document.body.classList.toggle('dark-mode', enabled);
  localStorage.setItem('weatherAppDarkMode', enabled);
  darkModeToggle.textContent = enabled ? '☀️' : '🌙';
}
setDarkMode(darkMode);
darkModeToggle.addEventListener('click', () => {
  darkMode = !darkMode;
  setDarkMode(darkMode);
});

// Loading indicator
function setLoading(loading) {
  loadingIndicator.hidden = !loading;
}

// Error message
function setError(msg) {
  errorMessage.textContent = msg || '';
}

// Cities list
function updateCitiesList() {
  citiesList.innerHTML = savedCities.map((city, idx) =>
    `<button aria-label="Show weather for ${city}" onclick="showCityWeather('${city}')">${city}</button>
     <button aria-label="Remove ${city}" onclick="removeCity(${idx})">❌</button>`
  ).join(' ');
}
window.showCityWeather = function(city) {
  locationInput.value = city;
  searchWeather();
};
window.removeCity = function(idx) {
  savedCities.splice(idx, 1);
  localStorage.setItem('weatherAppCities', JSON.stringify(savedCities));
  updateCitiesList();
};
updateCitiesList();

// Debounced search
locationInput.addEventListener('input', debounce(() => setError(''), 400));

// Fetch weather by city or coords
async function fetchWeatherData({ city, lat, lon }) {
  setLoading(true);
  setError('');
  try {
    let coords;
    if (lat && lon) {
      coords = { lat, lon, name: 'Your location' };
    } else {
      const geoRes = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${OPENWEATHER_API_KEY}`);
      const geoData = await geoRes.json();
      if (!geoData.length) throw new Error('Location not found.');
      coords = { lat: geoData[0].lat, lon: geoData[0].lon, name: geoData[0].name + ', ' + geoData[0].country };
    }

    // One Call API for weather & forecast
    const url = `https://api.openweathermap.org/data/2.5/onecall?lat=${coords.lat}&lon=${coords.lon}&units=metric&appid=${OPENWEATHER_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    // Air Quality
    const airRes = await fetch(`https://api.airvisual.com/v2/nearest_city?lat=${coords.lat}&lon=${coords.lon}&key=${AIRVISUAL_API_KEY}`);
    const airData = (await airRes.json()).data;

    // Historical (yesterday)
    const dtYesterday = Math.floor(Date.now()/1000) - 86400;
    const histRes = await fetch(`https://api.openweathermap.org/data/2.5/onecall/timemachine?lat=${coords.lat}&lon=${coords.lon}&dt=${dtYesterday}&units=metric&appid=${OPENWEATHER_API_KEY}`);
    const histData = await histRes.json();

    setLoading(false);
    renderWeather(coords, data, airData, histData);
    // Save city (avoid duplicates)
    if (city && !savedCities.includes(city)) {
      savedCities.push(city);
      localStorage.setItem('weatherAppCities', JSON.stringify(savedCities));
      updateCitiesList();
    }
    // Map
    renderMap(coords.lat, coords.lon, data.current.weather[0].main);
  } catch (err) {
    setLoading(false);
    setError(err.message || 'Error fetching weather.');
  }
}

// Form submit
locationForm.addEventListener('submit', e => {
  e.preventDefault();
  searchWeather();
});
function searchWeather() {
  const city = locationInput.value.trim();
  if (!city) return setError('Please enter a city or ZIP code.');
  fetchWeatherData({ city });
}

// Geolocation
geoBtn.addEventListener('click', () => {
  if (!navigator.geolocation) return setError('Geolocation not supported.');
  setLoading(true);
  navigator.geolocation.getCurrentPosition(
    pos => {
      fetchWeatherData({ lat: pos.coords.latitude, lon: pos.coords.longitude });
    },
    err => {
      setLoading(false);
      setError('Could not get your location.');
    }
  );
});

// Render weather
function renderWeather(coords, data, airData, histData) {
  // Current weather
  weatherDisplay.innerHTML = `
    <h2>${coords.name} - ${data.current.weather[0].main}
      <img src="https://openweathermap.org/img/wn/${data.current.weather[0].icon}@2x.png" alt="${data.current.weather[0].description}" />
    </h2>
    <div>
      <strong>Temp:</strong> ${data.current.temp}°C<br>
      <strong>Humidity:</strong> ${data.current.humidity}%<br>
      <strong>Wind:</strong> ${data.current.wind_speed} m/s<br>
      <strong>Feels Like:</strong> ${data.current.feels_like}°C<br>
      <strong>Conditions:</strong> ${data.current.weather[0].description}
    </div>
  `;

  // Hourly
  hourlyForecast.innerHTML = `<h3>Hourly Forecast</h3><div style="display:flex;overflow-x:auto;">` +
    data.hourly.slice(0, 12).map(hour =>
      `<div style="min-width:90px;text-align:center;padding:0.5rem;">
        ${new Date(hour.dt*1000).getHours()}:00<br>
        <img src="https://openweathermap.org/img/wn/${hour.weather[0].icon}.png" alt="" /><br>
        ${hour.temp}°C
      </div>`
    ).join('') + `</div>`;

  // Weekly
  weeklyForecast.innerHTML = `<h3>Weekly Forecast</h3><div style="display:flex;overflow-x:auto;">` +
    data.daily.slice(0,7).map(day =>
      `<div style="min-width:100px;text-align:center;padding:0.5rem;">
        ${new Date(day.dt*1000).toLocaleDateString(undefined, { weekday: 'short' })}<br>
        <img src="https://openweathermap.org/img/wn/${day.weather[0].icon}.png" alt="" /><br>
        ${day.temp.day}°C
      </div>`
    ).join('') + `</div>`;

  // Air Quality
  airQuality.innerHTML = `
    <h3>Air Quality Index</h3>
    <div>
      <strong>AQI:</strong> ${airData.current.pollution.aqius} (US EPA)<br>
      <strong>Main Pollutant:</strong> ${airData.current.pollution.mainus}
    </div>
  `;

  // Alerts
  if (data.alerts && data.alerts.length) {
    alertsDisplay.innerHTML = `<h3>Severe Weather Alerts</h3>` +
      data.alerts.map(alert =>
        `<strong>${alert.event}</strong>: ${alert.description}<br>
        <em>Severity: ${alert.severity || 'Unknown'}</em><br>
        <em>Effective: ${new Date(alert.start * 1000).toLocaleString()}</em>
        <hr>`
      ).join('');
    alertsDisplay.style.display = 'block';
  } else {
    alertsDisplay.style.display = 'none';
    alertsDisplay.innerHTML = '';
  }

  // Historical Weather
  historicalDisplay.innerHTML = `
    <h3>Yesterday's Weather</h3>
    <strong>Temp:</strong> ${histData.current.temp}°C<br>
    <strong>Conditions:</strong> ${histData.current.weather[0].description}
  `;
}

// Weather Map (Leaflet.js)
function renderMap(lat, lon, weatherMain) {
  // Include Leaflet CSS & JS on demand
  if (!window.L) {
    const leafletCSS = document.createElement('link');
    leafletCSS.rel = 'stylesheet';
    leafletCSS.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(leafletCSS);

    const leafletJS = document.createElement('script');
    leafletJS.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    leafletJS.onload = () => drawMap(lat, lon, weatherMain);
    document.body.appendChild(leafletJS);
  } else {
    drawMap(lat, lon, weatherMain);
  }
}
function drawMap(lat, lon, weatherMain) {
  mapDisplay.innerHTML = `<div id="mapid" style="height:300px;"></div>`;
  if (window.map) window.map.remove();
  window.map = L.map('mapid').setView([lat, lon], 10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(window.map);
  L.marker([lat, lon]).addTo(window.map).bindPopup(`Weather: ${weatherMain}`).openPopup();
}

// On load: auto-detect
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    pos => fetchWeatherData({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
    () => {} // Silent fail
  );
}
