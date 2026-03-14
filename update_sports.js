const fs = require('fs');
const https = require('https');
const path = require('path');

// Configurações
const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = 'v3.football.api-sports.io';
const UPDATE_JSON_PATH = path.join(__dirname, 'update.json'); // Ajuste o caminho conforme o local do update.json
const TARGET_LEAGUES = [71, 39, 140, 135, 78, 61, 2]; // BR, Premier, LaLiga, Serie A, Bundes, Ligue 1, Champions

if (!API_KEY) {
    console.error("ERRO: API_FOOTBALL_KEY não definida nos Secrets do GitHub.");
    process.exit(1);
}

// Data de hoje formato YYYY-MM-DD
function getTodayDateString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Fazer requisição na API Football
function fetchApiFootball(endpoint) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: BASE_URL,
            path: endpoint,
            method: 'GET',
            headers: {
                'x-apisports-key': API_KEY
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json.response || []);
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

async function updateSportsData() {
    console.log("Iniciando atualização de jogos...");
    const dateStr = getTodayDateString();
    
    try {
        // Busca os jogos de hoje
        console.log(`Buscando jogos para a data: ${dateStr}`);
        const todayMatches = await fetchApiFootball(`/fixtures?date=${dateStr}`);
        
        // Filtra para manter apenas jogos de ligas importantes para economizar espaço e focar no que importa
        const filteredMatches = todayMatches.filter(match => 
            TARGET_LEAGUES.includes(match.league.id) || 
            match.league.country === 'Brazil' ||
            match.league.name.includes('World')
        );
        
        console.log(`Encontrados ${filteredMatches.length} jogos relevantes de um total de ${todayMatches.length}.`);

        // Ler update.json atual
        let updateData = {};
        if (fs.existsSync(UPDATE_JSON_PATH)) {
            const rawData = fs.readFileSync(UPDATE_JSON_PATH, 'utf8');
            try {
               updateData = JSON.parse(rawData);
            } catch(e) {
               console.error("Erro ao analisar update.json existente. Criando um novo objeto.");
            }
        } else {
            console.warn("update.json não encontrado no diretório atual, as outras chaves podem ser perdidas. Certifique-se de preencher o caminho correto.");
        }

        // Adicionar ou sobrescrever a chave JOGOS_ESPORTES
        updateData.JOGOS_ESPORTES = filteredMatches;

        // Salvar novamente o arquivo
        fs.writeFileSync(UPDATE_JSON_PATH, JSON.stringify(updateData, null, 4), 'utf8');
        console.log("update.json foi atualizado com sucesso com " + filteredMatches.length + " jogos na chave JOGOS_ESPORTES.");

    } catch (error) {
        console.error("Erro fatal na atualização dos esportes:", error);
        process.exit(1);
    }
}

updateSportsData();

