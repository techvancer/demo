const fs = require('fs');
const https = require('https');

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
    const [k, v] = line.split('=');
    if (k) acc[k] = v?.trim();
    return acc;
}, {});

fetch(env.VITE_SUPABASE_URL + '/rest/v1/questions_tbl?select=*&limit=1', {
    headers: { apikey: env.VITE_SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + env.VITE_SUPABASE_SERVICE_KEY }
}).then(r => r.json()).then(console.log).catch(console.error);
