// utils.js - Hilfsfunktionen

/**
 * Formatiert eine Zahl mit Punkt als Tausendertrennzeichen und Komma als Dezimaltrennzeichen.
 * Beispiel: 1234567.89 -> "1.234.567,89"
 */
export function formatNumber(num) {
    if (typeof num !== 'number' || isNaN(num)) return '';
    const parts = num.toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return parts.join(',');
}

/**
 * Parst eine formatierte Zahl (mit Punkt Tausender und Komma Dezimal) zurück in Number.
 * Beispiel: "1.234,56" -> 1234.56
 */
export function parseNumber(str) {
    if (typeof str !== 'string') return NaN;
    const clean = str.replace(/\./g, '').replace(',', '.');
    return parseFloat(clean);
}

/**
 * Speichert den aktuellen localStorage-Inhalt in einer Datei.
 */
export function exportData(filename = 'backup.json') {
    const data = JSON.stringify(localStorage, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Lädt Daten aus einer Datei und schreibt sie in localStorage (überschreibt bestehende Werte).
 */
export function importData(file, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const obj = JSON.parse(e.target.result);
            Object.keys(obj).forEach(key => {
                localStorage.setItem(key, obj[key]);
            });
            if (callback) callback(true);
        } catch (err) {
            console.error('Import failed', err);
            if (callback) callback(false);
        }
    };
    reader.readAsText(file);
}
