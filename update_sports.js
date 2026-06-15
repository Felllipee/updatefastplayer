const fs = require('fs');
const https = require('https');
const path = require('path');

// Configurações
const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = 'v3.football.api-sports.io';
const UPDATE_JSON_PATH = path.join(__dirname, 'sports.json');

// Lista completa de ligas para garantir que todos os jogos apareçam
const TARGET_LEAGUES = [
    71, 72, 73, 75, 76, // Brasil: Serie A, B, C, Copa do Brasil, Supercopa
    39, 40, 41, 42, 45, 48, // Inglaterra
    140, 141, 143, // Espanha
    135, 136, 137, // Itália
    78, 79, 81, // Alemanha
    61, 62, 63, // França
    2, 3, 5, 848, 13, 11, 810 // Internacionais (Champions, Libertadores, etc)
];

if (!API_KEY) {
    console.error("ERRO: API_FOOTBALL_KEY não definida nos Secrets.");
    process.exit(1);
}

function getTodayDateStringBR() {
    const now = new Date();
    // Ajuste para BRT (UTC-3)
    const brDate = new Date(now.getTime() - (3 * 60 * 60 * 1000));
    const year = brDate.getFullYear();
    const month = String(brDate.getMonth() + 1).padStart(2, '0');
    const day = String(brDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function fetchApiFootball(endpoint) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: BASE_URL,
            path: endpoint,
            method: 'GET',
            headers: { 'x-apisports-key': API_KEY }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json.response || []);
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function updateSportsData() {
    const dateStr = getTodayDateStringBR();
    try {
        console.log(`Buscando grade completa (BRT): ${dateStr}`);
        const todayMatches = await fetchApiFootball(`/fixtures?date=${dateStr}&timezone=America/Sao_Paulo`);
        
        const filteredMatches = todayMatches.filter(match => 
            TARGET_LEAGUES.includes(match.league.id) || 
            match.league.country === 'Brazil' ||
            match.league.name.includes('World')
        );
        
        const delay = ms => new Promise(res => setTimeout(res, ms));
        
        for (const match of filteredMatches) {
            console.log(`Enriquecendo: ${match.teams.home.name} x ${match.teams.away.name}`);
            try {
                match.app_lineups = await fetchApiFootball(`/fixtures/lineups?fixture=${match.fixture.id}`);
                await delay(200);
                match.app_statistics = await fetchApiFootball(`/fixtures/statistics?fixture=${match.fixture.id}`);
                await delay(200);
                
                let season = match.league.season || 2024;
                let standings = await fetchApiFootball(`/standings?league=${match.league.id}&season=${season}`);
                if (!standings || standings.length === 0) {
                    standings = await fetchApiFootball(`/standings?league=${match.league.id}&season=${season - 1}`);
                }
                match.app_standings = standings;
                await delay(200);
            } catch(e) { console.warn(`Erro no jogo ${match.fixture.id}`); }
        }

        const updateData = { 
            JOGOS_ESPORTES: filteredMatches,
            updated_at: new Date().toISOString() 
        };

        fs.writeFileSync(UPDATE_JSON_PATH, JSON.stringify(updateData, null, 2), 'utf8');
        console.log("Sucesso: sports.json atualizado no GitHub.");
    } catch (error) {
        console.error("Erro fatal:", error);
        process.exit(1);
    }
}
updateSportsData();
