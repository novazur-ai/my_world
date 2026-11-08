const base = "https://api.open-meteo.com/v1/forecast?latitude=43.6644&longitude=7.1489&timezone=Europe%2FParis&forecast_days=7"
 + "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day,precipitation"
 + "&hourly=temperature_2m,weather_code,precipitation_probability,precipitation,wind_speed_10m,is_day"
 + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_gusts_10m_max,uv_index_max,sunrise,sunset";
const r = await fetch(base, { headers: { Origin: "https://novazur-ai.github.io" } }); console.log("statut", r.status, "CORS :", r.headers.get("access-control-allow-origin"));
const j = await r.json(); if (j.error) { console.log(JSON.stringify(j)); process.exit(0); }
console.log("courant", JSON.stringify(j.current));
console.log("jours", JSON.stringify(j.daily));
const h = j.hourly; const i0 = h.time.findIndex(t => t >= j.current.time.slice(0,13)); console.log("modèle / taille", r.headers.get("content-length"), JSON.stringify(j).length);
console.log("heures", JSON.stringify(h.time.slice(i0, i0+14).map((t,k)=>[t.slice(11,16), h.temperature_2m[i0+k], h.weather_code[i0+k], h.precipitation_probability[i0+k], h.wind_speed_10m[i0+k]])));
/* aéroport de Nice */
const n = await (await fetch(base.replace("latitude=43.6644&longitude=7.1489","latitude=43.6584&longitude=7.2159"))).json();
console.log("Nice aéroport courant", JSON.stringify(n.current));
/* géocodage */
const g = await (await fetch("https://geocoding-api.open-meteo.com/v1/search?name=Cagnes&count=3&language=fr&countryCode=FR")).json();
console.log("géocodage", JSON.stringify(g.results.map(x=>[x.name,x.admin2,x.latitude,x.longitude])));
