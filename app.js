// app.js - Main Application Logic

let tournament = null;

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    tournament = new Tournament();
    setupNavigationListeners();
    renderSetupSection();
}

function setupNavigationListeners() {
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Entferne active class von allen
            navBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            
            // Füge active class zu aktuellem Button hinzu
            e.target.classList.add('active');
            
            // Zeige entsprechende Section
            const sectionId = e.target.dataset.section;
            document.getElementById(sectionId).classList.add('active');
            
            // Render Inhalte
            if (sectionId === 'matches') renderMatchesSection();
            if (sectionId === 'results') renderResultsSection();
            if (sectionId === 'stats') renderStatsSection();
        });
    });
}

function renderSetupSection() {
    const teams = getAllTeams();
    
    // Renderiere Pro Teams
    const proContainer = document.getElementById('profi-teams');
    proContainer.innerHTML = teams.pro
        .map(team => `<div class="team-item pro">${team.name} (${team.division})</div>`)
        .join('');
    
    // Renderiere Amateur Teams
    const amateurContainer = document.getElementById('amateur-teams');
    amateurContainer.innerHTML = teams.amateur
        .map(team => `<div class="team-item amateur">${team.name} (${team.division})</div>`)
        .join('');
    
    // Start Button
    const startBtn = document.getElementById('start-tournament');
    startBtn.addEventListener('click', () => {
        tournament.start();
        renderMatchesSection();
        switchToSection('matches');
    });
}

function renderMatchesSection() {
    const container = document.getElementById('matches-container');
    const roundInfo = document.getElementById('match-round-info');
    
    if (tournament.currentRound === 0) {
        container.innerHTML = '<p>Starten Sie das Turnier im Setup-Tab um Spiele zu sehen.</p>';
        roundInfo.innerHTML = '';
        return;
    }

    const playedMatches = tournament.matches.filter(m => m.result !== null).length;
    const totalMatches = tournament.matches.length;
    
    roundInfo.innerHTML = `
        <h3>Runde ${tournament.currentRound}</h3>
        <p>Gespielt: ${playedMatches}/${totalMatches}</p>
    `;

    container.innerHTML = tournament.matches
        .map((match) => renderMatchCard(match))
        .join('');

    // Event Listener für Würfel Buttons
    document.querySelectorAll('.btn-roll-dice').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const matchId = parseInt(e.target.dataset.matchId);
            playMatch(matchId);
        });
    });

    // Event Listener für Next Round Button
    const nextRoundBtn = document.getElementById('next-round-btn');
    if (nextRoundBtn) {
        nextRoundBtn.addEventListener('click', () => {
            const result = tournament.continueToNextRound();
            if (result === 'tournament_finished') {
                alert('🏆 Turnier abgeschlossen! ' + tournament.getTournamentWinner().name + ' ist Pokalsieger!');
            }
            renderMatchesSection();
        });
    }
}

function renderMatchCard(match) {
    const isPlayed = match.result !== null;
    const homeTeamClass = match.homeType === 'amateur' ? 'home' : '';
    const awayTeamClass = match.awayType === 'amateur' ? 'away' : '';

    let diceDisplay = `
        <div class="match-team ${homeTeamClass}">
            <span class="team-name">${match.home.name}</span>
            <span class="team-division">${match.home.division}</span>
            ${isPlayed ? `<span class="dice-value">${match.result.homeTotal || match.diceResult.home}</span>` : 
                        `<span class="dice-value pending">-</span>`}
        </div>
        <div class="vs-separator">vs</div>
        <div class="match-team ${awayTeamClass}">
            <span class="team-name">${match.away.name}</span>
            <span class="team-division">${match.away.division}</span>
            ${isPlayed ? `<span class="dice-value">${match.result.awayTotal || match.diceResult.away}</span>` : 
                        `<span class="dice-value pending">-</span>`}
        </div>
    `;

    let resultDisplay = '';
    if (isPlayed) {
        const winner = match.result.winner === 'home' ? match.home.name : match.away.name;
        const extraInfo = match.result.extraTime ? ' (n.V.)' : '';
        const penaltyInfo = match.result.penalties ? ` (11m: ${match.result.homeScore}:${match.result.awayScore})` : '';
        resultDisplay = `<div style="text-align: center; margin-top: 1rem; padding: 0.5rem; background: #e8f5e9; border-radius: 4px;"><strong>${winner}${extraInfo}${penaltyInfo}</strong></div>`;
    }

    const actionButton = isPlayed ? 
        '' : 
        `<button class="btn-small btn-roll-dice" data-match-id="${match.id}">🎲 Würfeln</button>`;

    return `
        <div class="match-card ${homeTeamClass || awayTeamClass ? homeTeamClass || awayTeamClass : ''}">
            ${diceDisplay}
            <div class="match-actions">
                ${actionButton}
            </div>
            ${resultDisplay}
        </div>
    `;
}

function playMatch(matchId) {
    const match = tournament.playMatch(matchId);
    renderMatchesSection();

    // Prüfe ob alle Spiele gespielt sind
    const allPlayed = tournament.matches.every(m => m.result !== null);
    if (allPlayed && tournament.currentRound > 0) {
        addNextRoundButton();
    }
}

function addNextRoundButton() {
    const container = document.getElementById('matches-container');
    if (!document.getElementById('next-round-btn')) {
        const btn = document.createElement('button');
        btn.id = 'next-round-btn';
        btn.className = 'btn-primary';
        btn.textContent = 'Nächste Runde';
        btn.style.width = '100%';
        btn.style.gridColumn = '1 / -1';
        container.appendChild(btn);
        btn.addEventListener('click', () => {
            const result = tournament.continueToNextRound();
            if (result === 'tournament_finished') {
                alert('🏆 Turnier abgeschlossen! ' + tournament.getTournamentWinner().name + ' ist Pokalsieger!');
                renderMatchesSection();
            } else {
                renderMatchesSection();
            }
        });
    }
}

function renderResultsSection() {
    const container = document.getElementById('results-container');

    if (tournament.results.length === 0) {
        container.innerHTML = '<p>Noch keine Spiele gespielt.</p>';
        return;
    }

    const resultsByRound = {};
    tournament.results.forEach(result => {
        if (!resultsByRound[result.round]) {
            resultsByRound[result.round] = [];
        }
        resultsByRound[result.round].push(result);
    });

    let html = '';
    Object.keys(resultsByRound).sort().forEach(round => {
        html += `<h3>Runde ${round}</h3>`;
        html += resultsByRound[round]
            .map(result => renderResultCard(result))
            .join('');
    });

    container.innerHTML = html;
}

function renderResultCard(result) {
    const homeScore = result.result.homeTotal || result.diceResult.home;
    const awayScore = result.result.awayTotal || result.diceResult.away;
    const winner = result.winner.name;
    
    let extra = '';
    if (result.result.extraTime) {
        extra += `<div class="result-details">⏱️ Verlängerung</div>`;
    }
    if (result.result.penalties) {
        extra += `<div class="result-details">🥅 Elfmeterschießen: ${result.result.homeScore}:${result.result.awayScore}</div>`;
    }

    return `
        <div class="result-card">
            <div style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
                <span><strong>${result.home.name}</strong><br><small>${result.home.division}</small></span>
                <span style="text-align: center;">
                    <div class="result-score">${homeScore}:${awayScore}</div>
                </span>
                <span style="text-align: right;"><strong>${result.away.name}</strong><br><small>${result.away.division}</small></span>
            </div>
            <div class="result-winner">🏆 ${winner}</div>
            ${extra}
        </div>
    `;
}

function renderStatsSection() {
    const stats = tournament.getStatistics();
    const container = document.getElementById('stats-container');

    const winner = tournament.getTournamentWinner();
    
    let winnerCard = '';
    if (winner) {
        winnerCard = `
            <div class="stat-card" style="background: linear-gradient(135deg, #fff700 0%, #ffd700 100%); color: #333;">
                <h4 style="color: #333;">🏆 Pokalsieger</h4>
                <div class="stat-value" style="color: #333;">${winner.name}</div>
            </div>
        `;
    }

    const html = `
        ${winnerCard}
        <div class="stat-card">
            <h4>Runde</h4>
            <div class="stat-value">${stats.currentRound}</div>
            <div class="stat-label">Aktuelle Runde</div>
        </div>
        <div class="stat-card">
            <h4>Spiele</h4>
            <div class="stat-value">${stats.totalMatches}</div>
            <div class="stat-label">Gesamt Partien</div>
        </div>
        <div class="stat-card">
            <h4>Verbliebene Teams</h4>
            <div class="stat-value">${stats.remainingTeams}</div>
            <div class="stat-label">noch im Turnier</div>
        </div>
        <div class="stat-card">
            <h4>Ausgeschiedene Profis</h4>
            <div class="stat-value">${stats.proTeamsEliminated}</div>
            <div class="stat-label">aus Profi-Topf</div>
        </div>
        <div class="stat-card">
            <h4>Ausgeschiedene Amateure</h4>
            <div class="stat-value">${stats.amateurTeamsEliminated}</div>
            <div class="stat-label">aus Amateur-Topf</div>
        </div>
    `;

    container.innerHTML = html;
}

function switchToSection(sectionId) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    
    const btn = document.querySelector(`[data-section="${sectionId}"]`);
    if (btn) btn.classList.add('active');
    
    const section = document.getElementById(sectionId);
    if (section) section.classList.add('active');
}