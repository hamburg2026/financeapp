// teams.js - Team-Definitionen

const TEAMS = {
    profi: {
        bundesliga_top6: [
            { name: 'FC Bayern München', division: 'BL Top 6', diceMax: 6 },
            { name: 'Borussia Dortmund', division: 'BL Top 6', diceMax: 6 },
            { name: 'TSG Hoffenheim', division: 'BL Top 6', diceMax: 6 },
            { name: 'VfB Stuttgart', division: 'BL Top 6', diceMax: 6 },
            { name: 'RB Leipzig', division: 'BL Top 6', diceMax: 6 },
            { name: 'Bayer Leverkusen', division: 'BL Top 6', diceMax: 6 }
        ],
        bundesliga_rest: [
            { name: 'Eintracht Frankfurt', division: 'BL', diceMax: 5 },
            { name: 'SC Freiburg', division: 'BL', diceMax: 5 },
            { name: 'FC Augsburg', division: 'BL', diceMax: 5 },
            { name: 'Hamburger SV', division: 'BL', diceMax: 5 },
            { name: 'Union Berlin', division: 'BL', diceMax: 5 },
            { name: 'Borussia Mönchengladbach', division: 'BL', diceMax: 5 },
            { name: 'SV Werder Bremen', division: 'BL', diceMax: 5 },
            { name: '1. FC Köln', division: 'BL', diceMax: 5 },
            { name: '1. FSV Mainz 05', division: 'BL', diceMax: 5 },
            { name: 'FC St. Pauli', division: 'BL', diceMax: 5 },
            { name: 'VfL Wolfsburg', division: 'BL', diceMax: 5 },
            { name: '1. FC Heidenheim', division: 'BL', diceMax: 5 }
        ],
        zweite_liga_top14: [
            { name: 'FC Schalke 04', division: '2.BL', diceMax: 4 },
            { name: 'SV Darmstadt 98', division: '2.BL', diceMax: 4 },
            { name: 'SV Elversberg', division: '2.BL', diceMax: 4 },
            { name: 'SC Paderborn 07', division: '2.BL', diceMax: 4 },
            { name: 'Hannover 96', division: '2.BL', diceMax: 4 },
            { name: 'Hertha BSC', division: '2.BL', diceMax: 4 },
            { name: '1. FC Kaiserslautern', division: '2.BL', diceMax: 4 },
            { name: 'Karlsruher SC', division: '2.BL', diceMax: 4 },
            { name: 'VfL Bochum', division: '2.BL', diceMax: 4 },
            { name: 'Fortuna Düsseldorf', division: '2.BL', diceMax: 4 },
            { name: '1. FC Nürnberg', division: '2.BL', diceMax: 4 },
            { name: 'Arminia Bielefeld', division: '2.BL', diceMax: 4 },
            { name: 'Dynamo Dresden', division: '2.BL', diceMax: 4 },
            { name: 'Preußen Münster', division: '2.BL', diceMax: 4 }
        ]
    },
    amateur: {
        zweite_liga_last4: [
            { name: 'Eintracht Braunschweig', division: '2.BL', diceMax: 4 },
            { name: 'SpVgg Greuther Fürth', division: '2.BL', diceMax: 4 },
            { name: 'Holstein Kiel', division: '2.BL', diceMax: 4 },
            { name: '1. FC Magdeburg', division: '2.BL', diceMax: 4 }
        ],
        dritte_liga_top5: [
            { name: 'VfL Osnabrück', division: '3.Liga', diceMax: 3 },
            { name: 'FC Energie Cottbus', division: '3.Liga', diceMax: 3 },
            { name: 'MSV Duisburg', division: '3.Liga', diceMax: 3 },
            { name: 'Rot-Weiss Essen', division: '3.Liga', diceMax: 3 },
            { name: 'SC Verl', division: '3.Liga', diceMax: 3 },
            { name: 'TSV 1860 München', division: '3.Liga', diceMax: 3 },
            { name: 'Hansa Rostock', division: '3.Liga', diceMax: 3 },
            { name: 'FC Erzgebirge Aue', division: '3.Liga', diceMax: 3 },
            { name: 'FC Viktoria Köln', division: '3.Liga', diceMax: 3 },
            { name: '1. FC Saarbrücken', division: '3.Liga', diceMax: 3 },
            { name: 'SV Waldhof Mannheim', division: '3.Liga', diceMax: 3 },
            { name: 'SSV Jahn Regensburg', division: '3.Liga', diceMax: 3 }
        ],
        regional: [
            { name: 'Teutonia 05 Ottensen', division: '4.Liga', diceMax: 2 },
            { name: 'VfB Lübeck', division: '4.Liga', diceMax: 2 },
            { name: 'Eintracht Norderstedt', division: '4.Liga', diceMax: 2 },
            { name: 'BTSV Oberneuland', division: '4.Liga', diceMax: 2 },
            { name: 'Vfl Oldenburg', division: '4.Liga', diceMax: 2 },
            { name: 'Delay Sports Berlin', division: '4.Liga', diceMax: 2 },
            { name: 'SV Babelsberg 03', division: '4.Liga', diceMax: 2 },
            { name: 'Hallescher FC II', division: '4.Liga', diceMax: 2 },
            { name: 'FC Carl Zeiss Jena', division: '4.Liga', diceMax: 2 },
            { name: 'Sportfreunde Lotte', division: '4.Liga', diceMax: 2 },
            { name: '1. FC Bocholt', division: '4.Liga', diceMax: 2 },
            { name: 'TuS Koblenz', division: '4.Liga', diceMax: 2 },
            { name: 'FK Pirmasens', division: '4.Liga', diceMax: 2 },
            { name: 'Kickers Offenbach', division: '4.Liga', diceMax: 2 },
            { name: 'FC 08 Villingen', division: '4.Liga', diceMax: 2 },
            { name: 'Stuttgarter Kickers', division: '4.Liga', diceMax: 2 }
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