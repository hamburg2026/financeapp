// modules/dashboard.js
import { formatNumber, exportData, importData } from '../utils.js';

export class Dashboard {
    render(container) {
        container.innerHTML = `
            <div class="module">
                <h2>Dashboard</h2>
                <p>Übersicht über alle Finanzdaten.</p>
                <div class="backup-buttons">
                    <button id="export-data" class="btn-small">Daten sichern</button>
                    <input type="file" id="import-file" style="display:none" />
                    <button id="import-data" class="btn-small">Daten laden</button>
                </div>
                <div id="summary" class="dashboard-grid">
                    <!-- Zusammenfassungskacheln -->
                </div>
                <div id="category-report" class="category-report">
                    <!-- Kategorienübersicht -->
                </div>
            </div>
        `;
        this.setupBackupButtons();
        this.loadSummary();
    }

    setupBackupButtons() {
        document.getElementById('export-data').addEventListener('click', () => {
            import('../utils.js').then(u => u.exportData());
        });
        document.getElementById('import-data').addEventListener('click', () => {
            document.getElementById('import-file').click();
        });
        document.getElementById('import-file').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                import('../utils.js').then(u => u.importData(file, success => {
                    if (success) alert('Daten erfolgreich importiert');
                    else alert('Fehler beim Import');
                    this.loadSummary();
                }));
            }
        });
    }

    loadSummary() {
        // Aggregiere Daten
        const accounts = JSON.parse(localStorage.getItem('bankAccounts')) || [];
        const transactions = JSON.parse(localStorage.getItem('transactions')) || [];
        const securities = JSON.parse(localStorage.getItem('securities')) || [];
        const prices = JSON.parse(localStorage.getItem('securityPrices')) || {};
        const depots = JSON.parse(localStorage.getItem('depots')) || [];
        const depotTrans = JSON.parse(localStorage.getItem('depotTransactions')) || [];
        const insurance = JSON.parse(localStorage.getItem('insuranceContracts')) || [];
        const realEstate = JSON.parse(localStorage.getItem('realEstate')) || [];
        const shares = JSON.parse(localStorage.getItem('companyShares')) || [];
        const subscriptions = JSON.parse(localStorage.getItem('subscriptions')) || [];
        const categories = JSON.parse(localStorage.getItem('categories')) || [];

        let totalBank = accounts.reduce((sum, acc) => sum + acc.balance, 0);
        let totalSecurities = 0;
        // Vereinfacht: Summe aller Depotwerte
        depots.forEach(depot => {
            const trans = depotTrans.filter(t => t.depotId == depot.id);
            const pos = {};
            trans.forEach(t => {
                if (!pos[t.securityId]) pos[t.securityId] = { qty: 0, cost: 0 };
                if (t.type === 'buy') {
                    pos[t.securityId].qty += t.quantity;
                    pos[t.securityId].cost += t.quantity * t.price + t.fees;
                } else if (t.type === 'sell') {
                    pos[t.securityId].qty -= t.quantity;
                }
            });
            Object.keys(pos).forEach(secId => {
                const qty = pos[secId].qty;
                if (qty > 0) {
                    const currentPrice = prices[secId] ? prices[secId].sort((a,b) => new Date(b.date) - new Date(a.date))[0].value : 0;
                    totalSecurities += qty * currentPrice;
                }
            });
        });
        let totalInsurance = insurance.reduce((sum, con) => sum + con.value, 0);
        let totalRealEstate = realEstate.reduce((sum, prop) => sum + prop.current, 0);
        let totalShares = shares.reduce((sum, sh) => sum + sh.value, 0);
        let totalAssets = totalBank + totalSecurities + totalInsurance + totalRealEstate + totalShares;

        let monthlyExpenses = subscriptions.reduce((sum, sub) => {
            if (sub.frequency === 'monthly') return sum + sub.cost;
            if (sub.frequency === 'quarterly') return sum + sub.cost / 3;
            if (sub.frequency === 'yearly') return sum + sub.cost / 12;
            return sum;
        }, 0);

        const summary = document.getElementById('summary');
        // create coloured tiles
        summary.innerHTML = `
            <div class="tile dashboard-bank">Bankkonten<br>${formatNumber(totalBank)} €</div>
            <div class="tile dashboard-securities">Wertpapiere<br>${formatNumber(totalSecurities)} €</div>
            <div class="tile dashboard-insurance">Versicherungen<br>${formatNumber(totalInsurance)} €</div>
            <div class="tile dashboard-realestate">Immobilien<br>${formatNumber(totalRealEstate)} €</div>
            <div class="tile dashboard-shares">Beteiligungen<br>${formatNumber(totalShares)} €</div>
            <div class="tile dashboard-subscriptions">Abos p.M.<br>${formatNumber(monthlyExpenses)} €</div>
        `;
        
        // Kategorien-Bericht
        this.loadCategoryReport(transactions, categories);
    }

    loadCategoryReport(transactions, categories) {
        // Hilfsfunktion: Finde die Hauptkategorie für eine gegebene Kategorie-ID
        const findRootCategory = (catId) => {
            const category = categories.find(c => c.id == catId);
            if (!category || category.parent === null) {
                return catId;
            }
            return findRootCategory(category.parent);
        };

        // Summiere Transaktionen nach Hauptkategorien
        const rootCategoryTotals = {};
        transactions.forEach(trans => {
            const catId = String(trans.category);
            if (catId && catId !== '') {
                const rootCatId = findRootCategory(catId);
                rootCategoryTotals[rootCatId] = (rootCategoryTotals[rootCatId] || 0) + Math.abs(trans.amount);
            }
        });

        // Baue Baum nur mit Hauptkategorien auf
        const buildCategoryTree = () => {
            let html = '';
            const rootCategories = categories.filter(cat => cat.parent === null);
            
            rootCategories.forEach(cat => {
                const total = rootCategoryTotals[String(cat.id)] || 0;
                
                html += `<div class="report-node parent">
                    ${cat.name}
                    <span class="report-amount">${formatNumber(total)} €</span>
                </div>`;
            });
            
            return html;
        };

        const reportHtml = `
            <h3>Ausgaben nach Hauptkategorien</h3>
            <div class="report-tree">
                ${categories.length > 0 ? buildCategoryTree() : '<p style="color:#999;">Keine Kategorien definiert</p>'}
            </div>
        `;

        document.getElementById('category-report').innerHTML = reportHtml;
    }
}