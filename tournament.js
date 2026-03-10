// tournament.js - Turnier-Logik

class Tournament {
    constructor() {
        this.teams = getAllTeams();
        this.currentRound = 0;
        this.matches = [];
        this.results = [];
        this.eliminated = [];
        this.diceRoller = new DiceRoller();
    }

    reset() {
        this.teams = getAllTeams();
        this.currentRound = 0;
        this.matches = [];
        this.results = [];
        this.eliminated = [];
    }

    start() {
        this.reset();
        this.createRound1Matches();
        this.currentRound = 1;
    }

    createRound1Matches() {
        // Runde 1: Amateure spielen gegen Profis
        // Amateure haben Heimrecht
        const proTeams = [...this.teams.pro];
        const amateurTeams = [...this.teams.amateur];

        this.matches = [];
        
        for (let i = 0; i < 32; i++) {
            const homeAmatuer = amateurTeams[i];
            const awayPro = proTeams[i];
            
            this.matches.push({
                id: i,
                round: 1,
                home: homeAmatuer,
                away: awayPro,
                homeType: 'amateur',
                awayType: 'pro',
                result: null,
                diceResult: null
            });
        }
    }

    createNextRoundMatches(winners) {
        // Nach Runde 1: 16 Gewinner spielen gegeneinander
        this.matches = [];
        this.currentRound++;

        // Für weitere Runden: Nur noch 3. Liga oder tiefer im Amateur-Topf
        let amateurWinners = winners.filter(w => w.type === 'amateur');
        let proWinners = winners.filter(w => w.type === 'pro');

        // Wenn weniger als 16 Amateure, füllen mit Profis
        while (amateurWinners.length < Math.min(16, winners.length / 2)) {
            amateurWinners.push(proWinners.shift());
        }

        // Paarungen mischen
        const shuffled = this.shuffleArray([...amateurWinners, ...proWinners]);
        
        for (let i = 0; i < shuffled.length; i += 2) {
            if (i + 1 < shuffled.length) {
                const team1 = shuffled[i];
                const team2 = shuffled[i + 1];
                
                // Zufälliges Heimrecht
                const isHome = Math.random() > 0.5;
                
                this.matches.push({
                    id: i / 2,
                    round: this.currentRound,
                    home: isHome ? team1 : team2,
                    away: isHome ? team2 : team1,
                    homeType: isHome ? team1.type : team2.type,
                    awayType: isHome ? team2.type : team1.type,
                    result: null,
                    diceResult: null
                });
            }
        }
    }

    playMatch(matchId) {
        const match = this.matches.find(m => m.id === matchId);
        if (!match) return null;

        // Würfelspiel
        const diceResult = this.diceRoller.rollForMatch(match.home, match.away);
        
        let finalResult = diceResult;
        
        // Wenn Unentschieden: Verlängerung
        if (diceResult.winner === 'draw') {
            const extraTime = this.diceRoller.addExtraTime(diceResult);
            finalResult = { ...diceResult, ...extraTime };
            
            // Wenn immer noch Unentschieden: Elfmeter
            if (finalResult.winner === 'penalty') {
                const penalties = this.diceRoller.addPenalties(finalResult);
                finalResult = { ...finalResult, ...penalties };
            }
        }

        match.diceResult = diceResult;
        match.result = finalResult;

        // Bestimme Sieger
        const winner = finalResult.winner === 'home' ? match.home : match.away;
        const loser = finalResult.winner === 'home' ? match.away : match.home;
        
        match.winner = winner;
        match.loser = loser;

        this.results.push({
            round: this.currentRound,
            home: match.home,
            away: match.away,
            diceResult: diceResult,
            finalResult: finalResult,
            winner: winner,
            loser: loser,
            homeType: match.homeType,
            awayType: match.awayType
        });

        this.eliminated.push({
            round: this.currentRound,
            team: loser
        });

        return match;
    }

    getWinnersOfRound() {
        return this.matches.filter(m => m.winner).map(m => ({
            ...m.winner,
            type: m.winner === m.home ? m.homeType : m.awayType
        }));
    }

    continueToNextRound() {
        const winners = this.getWinnersOfRound();
        
        if (winners.length === 1) {
            return 'tournament_finished';
        }

        this.createNextRoundMatches(winners);
        return 'next_round_created';
    }

    shuffleArray(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    getTournamentWinner() {
        if (this.results.length === 0) return null;
        
        const lastResult = this.results[this.results.length - 1];
        return lastResult.winner;
    }

    getStatistics() {
        const proEliminated = this.eliminated.filter(e => 
            TEAMS.profi.bundesliga_top6.some(t => t.name === e.team.name) ||
            TEAMS.profi.bundesliga_rest.some(t => t.name === e.team.name) ||
            TEAMS.profi.zweite_liga_top14.some(t => t.name === e.team.name)
        ).length;

        const amateurEliminated = this.eliminated.length - proEliminated;

        return {
            totalMatches: this.results.length,
            proTeamsEliminated: proEliminated,
            amateurTeamsEliminated: amateurEliminated,
            currentRound: this.currentRound,
            remainingTeams: 64 - this.eliminated.length
        };
    }
}