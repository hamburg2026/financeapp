// teams.js - Team-Definitionen

const TEAMS = {
    profi: {
        bundesliga_top6: [
            { name: 'FC Bayern München', division: 'BL Top 6', diceMax: 6 },
            { name: 'Borussia Dortmund', division: 'BL Top 6', diceMax: 6 },
            { name: 'RB Leipzig', division: 'BL Top 6', diceMax: 6 },
            { name: 'Bayer Leverkusen', division: 'BL Top 6', diceMax: 6 },
            { name: 'Eintracht Frankfurt', division: 'BL Top 6', diceMax: 6 },
            { name: 'SC Freiburg', division: 'BL Top 6', diceMax: 6 }
        ],
        bundesliga_rest: [
            { name: 'VfL Wolfsburg', division: 'BL', diceMax: 5 },
            { name: 'TSG Hoffenheim', division: 'BL', diceMax: 5 },
            { name: 'FC Augsburg', division: 'BL', diceMax: 5 },
            { name: 'VfB Stuttgart', division: 'BL', diceMax: 5 },
            { name: 'Union Berlin', division: 'BL', diceMax: 5 },
            { name: 'Borussia Mönchengladbach', division: 'BL', diceMax: 5 },
            { name: '1. FC Köln', division: 'BL', diceMax: 5 },
            { name: 'SV Werder Bremen', division: 'BL', diceMax: 5 },
            { name: '1. FC Heidenheim', division: 'BL', diceMax: 5 },
            { name: 'VfL Bochum', division: 'BL', diceMax: 5 },
            { name: 'FC Schalke 04', division: 'BL', diceMax: 5 },
            { name: 'SV Darmstadt 98', division: 'BL', diceMax: 5 }
        ],
        zweite_liga_top14: [
            { name: 'Hamburger SV', division: '2.BL', diceMax: 4 },
            { name: 'Hertha BSC', division: '2.BL', diceMax: 4 },
            { name: 'VfL Osnabrück', division: '2.BL', diceMax: 4 },
            { name: 'Holstein Kiel', division: '2.BL', diceMax: 4 },
            { name: '1. FC Magdeburg', division: '2.BL', diceMax: 4 },
            { name: 'Hansa Rostock', division: '2.BL', diceMax: 4 },
            { name: 'Dynamo Dresden', division: '2.BL', diceMax: 4 },
            { name: '1. FC Kaiserslautern', division: '2.BL', diceMax: 4 },
            { name: 'Karlsruher SC', division: '2.BL', diceMax: 4 },
            { name: 'FC St. Pauli', division: '2.BL', diceMax: 4 },
            { name: 'SV Sandhausen', division: '2.BL', diceMax: 4 },
            { name: 'FC Ingolstadt', division: '2.BL', diceMax: 4 },
            { name: 'VfL Osnabrück II', division: '2.BL', diceMax: 4 },
            { name: '1. FC Saarbrücken', division: '2.BL', diceMax: 4 }
        ]
    },
    amateur: {
        zweite_liga_last4: [
            { name: 'SV Elversberg', division: '2.BL', diceMax: 4 },
            { name: 'SC Paderborn', division: '2.BL', diceMax: 4 },
            { name: 'FC Ingolstadt 04', division: '2.BL', diceMax: 4 },
            { name: '1. FC Kaiserslautern II', division: '2.BL', diceMax: 4 }
        ],
        dritte_liga_top5: [
            { name: '1. FC Saarbrücken', division: '3.Liga', diceMax: 3 },
            { name: 'Hallescher FC', division: '3.Liga', diceMax: 3 },
            { name: 'SV Meppen', division: '3.Liga', diceMax: 3 },
            { name: 'FC Viktoria Köln', division: '3.Liga', diceMax: 3 },
            { name: 'SC Verl', division: '3.Liga', diceMax: 3 }
        ],
        regional: [
            { name: 'SC Vöhringen', division: 'Regional', diceMax: 2 },
            { name: 'VfB Garching', division: 'Regional', diceMax: 2 },
            { name: 'TuS Maccabi Frankfurt', division: 'Regional', diceMax: 2 },
            { name: 'TSV 1860 München Amateure', division: 'Regional', diceMax: 2 },
            { name: 'VfB Stuttgart Amateure', division: 'Regional', diceMax: 2 },
            { name: 'Borussia Dortmund II', division: 'Regional', diceMax: 2 },
            { name: 'Bayer Leverkusen II', division: 'Regional', diceMax: 2 },
            { name: '1. FC Köln II', division: 'Regional', diceMax: 2 },
            { name: 'SV Darmstadt 98 II', division: 'Regional', diceMax: 2 },
            { name: 'FC Schalke 04 II', division: 'Regional', diceMax: 2 },
            { name: 'FC Bayern München II', division: 'Regional', diceMax: 2 },
            { name: 'VfL Wolfsburg II', division: 'Regional', diceMax: 2 },
            { name: 'Hertha BSC II', division: 'Regional', diceMax: 2 },
            { name: 'Eintracht Frankfurt II', division: 'Regional', diceMax: 2 },
            { name: 'TSG Hoffenheim II', division: 'Regional', diceMax: 2 },
            { name: 'FC Augsburg II', division: 'Regional', diceMax: 2 },
            { name: 'Union Berlin II', division: 'Regional', diceMax: 2 },
            { name: '1. FC Heidenheim II', division: 'Regional', diceMax: 2 },
            { name: 'Hannover 96 II', division: 'Regional', diceMax: 2 },
            { name: 'FC St. Pauli II', division: 'Regional', diceMax: 2 },
            { name: 'VfL Bochum II', division: 'Regional', diceMax: 2 },
            { name: 'Eintracht Braunschweig II', division: 'Regional', diceMax: 2 },
            { name: '1. FC Nürnberg II', division: 'Regional', diceMax: 2 }
        ]
    }
};

function getAllTeams() {
    return {
        pro: [
            ...TEAMS.profi.bundesliga_top6,
            ...TEAMS.profi.bundesliga_rest,
            ...TEAMS.profi.zweite_liga_top14
        ],
        amateur: [
            ...TEAMS.amateur.zweite_liga_last4,
            ...TEAMS.amateur.dritte_liga_top5,
            ...TEAMS.amateur.regional
        ]
    };
}