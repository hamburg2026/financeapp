// teams.js - Team-Definitionen

const TEAMS = {
    profi: {
        bundesliga_top6: [
            { name: 'FC Bayern München', division: 'BL Top 6', diceMax: 6 },
            { name: 'Borussia Dortmund', division: 'BL Top 6', diceMax: 6 },
            { name: 'RB Leipzig', division: 'BL Top 6', diceMax: 6 },
            { name: 'Bayer Leverkusen', division: 'BL Top 6', diceMax: 6 },
            { name: 'VfL Wolfsburg', division: 'BL Top 6', diceMax: 6 },
            { name: 'SC Freiburg', division: 'BL Top 6', diceMax: 6 }
        ],
        bundesliga_rest: [
            { name: 'Eintracht Frankfurt', division: 'BL', diceMax: 5 },
            { name: 'TSG Hoffenheim', division: 'BL', diceMax: 5 },
            { name: 'FC Augsburg', division: 'BL', diceMax: 5 },
            { name: 'VfB Stuttgart', division: 'BL', diceMax: 5 },
            { name: 'Union Berlin', division: 'BL', diceMax: 5 },
            { name: 'Borussia Mönchengladbach', division: 'BL', diceMax: 5 },
            { name: '1. FC Köln', division: 'BL', diceMax: 5 },
            { name: 'SV Werder Bremen', division: 'BL', diceMax: 5 },
            { name: 'FC Mainz 05', division: 'BL', diceMax: 5 },
            { name: 'Hamburger SV', division: 'BL', diceMax: 5 },
            { name: 'FSV Mainz 05 II', division: 'BL', diceMax: 5 },
            { name: 'VfL Bochum', division: 'BL', diceMax: 5 }
        ],
        zweite_liga_top14: [
            { name: 'Hannover 96', division: '2.BL', diceMax: 4 },
            { name: 'FC Nürnberg', division: '2.BL', diceMax: 4 },
            { name: '1. FC Kaiserslautern', division: '2.BL', diceMax: 4 },
            { name: 'SV Darmstadt 98', division: '2.BL', diceMax: 4 },
            { name: 'SC Paderborn', division: '2.BL', diceMax: 4 },
            { name: '1. FC Heidenheim', division: '2.BL', diceMax: 4 },
            { name: 'KFC Uerdingen', division: '2.BL', diceMax: 4 },
            { name: 'Fortuna Düsseldorf', division: '2.BL', diceMax: 4 },
            { name: 'Alexios Rantos', division: '2.BL', diceMax: 4 },
            { name: 'Erzgebirge Aue', division: '2.BL', diceMax: 4 },
            { name: '1. FC Saarbrücken', division: '2.BL', diceMax: 4 },
            { name: 'FC Ingolstadt', division: '2.BL', diceMax: 4 },
            { name: 'VfL Osnabrück', division: '2.BL', diceMax: 4 },
            { name: 'SG Dynamo Dresden', division: '2.BL', diceMax: 4 }
        ]
    },
    amateur: {
        zweite_liga_last4: [
            { name: 'Würzburger Kickers', division: '2.BL', diceMax: 4 },
            { name: 'TSV 1860 München', division: '2.BL', diceMax: 4 },
            { name: 'Jahn Regensburg', division: '2.BL', diceMax: 4 },
            { name: 'VfR Aalen', division: '2.BL', diceMax: 4 }
        ],
        dritte_liga_top5: [
            { name: 'SSV Ulm 1846', division: '3.Liga', diceMax: 3 },
            { name: 'Meppen TuS', division: '3.Liga', diceMax: 3 },
            { name: 'Hallescher FC', division: '3.Liga', diceMax: 3 },
            { name: '1. FC Saarland', division: '3.Liga', diceMax: 3 },
            { name: 'SV Großaspach', division: '3.Liga', diceMax: 3 }
        ],
        regional: [
            { name: 'VfB Leipzig', division: 'Regional', diceMax: 2 },
            { name: 'FSV Zwickau', division: 'Regional', diceMax: 2 },
            { name: 'BSC Rehberge Berlin', division: 'Regional', diceMax: 2 },
            { name: 'VfL Bad Salzuflen', division: 'Regional', diceMax: 2 },
            { name: 'TSV Schott Mainz', division: 'Regional', diceMax: 2 },
            { name: 'Blau-Weiß 90 Berlin', division: 'Regional', diceMax: 2 },
            { name: 'Kölner Kickers', division: 'Regional', diceMax: 2 },
            { name: 'SC Vöhringen', division: 'Regional', diceMax: 2 },
            { name: 'VfB Durlach', division: 'Regional', diceMax: 2 },
            { name: 'SV Garching', division: 'Regional', diceMax: 2 },
            { name: 'TSV 1861 Zirndorf', division: 'Regional', diceMax: 2 },
            { name: 'SV Neuaubing', division: 'Regional', diceMax: 2 },
            { name: 'FCN Illertissen', division: 'Regional', diceMax: 2 },
            { name: 'SV Bad Vilbel', division: 'Regional', diceMax: 2 },
            { name: 'TuS Maccabi Frankfurt', division: 'Regional', diceMax: 2 },
            { name: 'FV Illertissen', division: 'Regional', diceMax: 2 },
            { name: 'SV Sandhausen', division: 'Regional', diceMax: 2 },
            { name: 'TSV Altstadt München', division: 'Regional', diceMax: 2 },
            { name: 'VfB Garching', division: 'Regional', diceMax: 2 },
            { name: 'SV Schwabing', division: 'Regional', diceMax: 2 },
            { name: 'FC Giesing-Mering', division: 'Regional', diceMax: 2 },
            { name: 'SV Oberliederbach', division: 'Regional', diceMax: 2 },
            { name: ' TSC Maccabi Eintracht', division: 'Regional', diceMax: 2 }
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