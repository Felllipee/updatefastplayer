const fs = require('fs');
const https = require('https');
const path = require('path');

// Configurações
const API_KEY = process.env.FOOTBALL_DATA_KEY; // novo secret no GitHub Actions
const BASE_URL = 'api.football-data.org';
const UPDATE_JSON_PATH = path.join(__dirname, 'sports.json');

// Competições disponíveis no plano gratuito da football-data.org
const TARGET_COMPETITIONS = ['PL', 'PD', 'BL1', 'SA', 'FL1', 'CL', 'DED', 'PPL', 'ELC', 'BSA', 'WC', 'EC'];

if (!API_KEY) {
    console.error("ERRO: FOOTBALL_DATA_KEY não definida nos Secrets.");
    process.exit(1);
}

function getTodayDateStringBR() {
    const now = new Date();
    const brDate = new Date(now.getTime() - (3 * 60 * 60 * 1000)); // Ajuste BRT (UTC-3)
    const year = brDate.getFullYear();
    const month = String(brDate.getMonth() + 1).padStart(2, '0');
    const day = String(brDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function fetchFootballData(endpoint) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: BASE_URL,
            path: endpoint,
            method: 'GET',
            headers: { 'X-Auth-Token': API_KEY }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    if (res.statusCode === 429) {
                        console.warn(`Rate limit (429) em ${endpoint} — pulando.`);
                        return resolve(null);
                    }
                    if (res.statusCode !== 200) {
                        console.warn(`Status ${res.statusCode} em ${endpoint}`);
                        return resolve(null);
                    }
                    const json = JSON.parse(data);
                    resolve(json);
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

const delay = ms => new Promise(res => setTimeout(res, ms));

async function updateSportsData() {
    const dateStr = getTodayDateStringBR();
    try {
        console.log(`Buscando grade do dia (BRT): ${dateStr}`);

        // 1 requisição = todos os jogos de hoje, de todas as competições do plano
        const matchesResponse = await fetchFootballData(`/v4/matches?dateFrom=${dateStr}&dateTo=${dateStr}`);
        const todayMatches = (matchesResponse && matchesResponse.matches) || [];

        const filteredMatches = todayMatches.filter(match =>
            TARGET_COMPETITIONS.includes(match.competition.code)
        );

        console.log(`Jogos encontrados hoje: ${filteredMatches.length}`);

        // Tabela de classificação: 1 requisição por competição que tem jogo hoje
        // (cacheada, não repete por jogo). Limite free = 10 req/min, então
        // espaçamos 6.5s entre chamadas pra ficar bem seguro.
        const standingsCache = {};
        const competitionsToday = [...new Set(filteredMatches.map(m => m.competition.code))];

        for (const code of competitionsToday) {
            console.log(`Buscando tabela: ${code}`);
            await delay(6500);
            standingsCache[code] = await fetchFootballData(`/v4/competitions/${code}/standings`);
        }

        for (const match of filteredMatches) {
            match.app_standings = standingsCache[match.competition.code] || null;
        }

        const updateData = {
            JOGOS_ESPORTES: filteredMatches,
            updated_at: new Date().toISOString()
        };

        fs.writeFileSync(UPDATE_JSON_PATH, JSON.stringify(updateData, null, 2), 'utf8');
        console.log(`Sucesso: sports.json atualizado (${filteredMatches.length} jogos).`);

    } catch (error) {
        console.error("Erro fatal:", error);
        process.exit(1);
    }
}

updateSportsData();
