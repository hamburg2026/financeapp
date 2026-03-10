// modules/depots.js
export class Depots {
    constructor() {
        this.depots = JSON.parse(localStorage.getItem('depots')) || [];
        this.transactions = JSON.parse(localStorage.getItem('depotTransactions')) || [];
    }

    render(container) {
        container.innerHTML = `
            <div class="module">
                <h2>Depots</h2>
                <form id="depot-form">
                    <input type="text" id="depot-name" placeholder="Depotname" required>
                    <button type="submit">Depot hinzufügen</button>
                </form>
                <h3>Depots</h3>
                <select id="depot-select"></select>
                <h3>Transaktionen</h3>
                <form id="transaction-form">
                    <select id="security-select" required></select>
                    <select id="transaction-type" required>
                        <option value="buy">Kauf</option>
                        <option value="sell">Verkauf</option>
                        <option value="dividend">Dividende</option>
                        <option value="interest">Zinsen</option>
                    </select>
                    <input type="number" id="quantity" placeholder="Anzahl" step="0.01" required>
                    <input type="number" id="price" placeholder="Preis pro Stück" step="0.01" required>
                    <input type="number" id="fees" placeholder="Gebühren" step="0.01" required>
                    <input type="date" id="transaction-date" required>
                    <button type="submit">Transaktion hinzufügen</button>
                </form>
                <h3>Depotübersicht</h3>
                <div id="depot-overview"></div>
            </div>
        `;
        this.populateDepots();
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('depot-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addDepot();
        });
        document.getElementById('transaction-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addTransaction();
        });
        document.getElementById('depot-select').addEventListener('change', () => {
            this.showOverview();
        });
    }

    addDepot() {
        const name = document.getElementById('depot-name').value;
        this.depots.push({ id: Date.now(), name });
        this.saveDepots();
        this.populateDepots();
        document.getElementById('depot-form').reset();
    }

    populateDepots() {
        const select = document.getElementById('depot-select');
        select.innerHTML = '';
        this.depots.forEach(depot => {
            select.innerHTML += `<option value="${depot.id}">${depot.name}</option>`;
        });
        this.updateSecuritySelect();
        this.showOverview();
    }

    updateSecuritySelect() {
        const securities = JSON.parse(localStorage.getItem('securities')) || [];
        const select = document.getElementById('security-select');
        select.innerHTML = '';
        securities.forEach(sec => {
            select.innerHTML += `<option value="${sec.id}">${sec.name}</option>`;
        });
    }

    addTransaction() {
        const depotId = document.getElementById('depot-select').value;
        const securityId = document.getElementById('security-select').value;
        const type = document.getElementById('transaction-type').value;
        const quantity = parseFloat(document.getElementById('quantity').value);
        const price = parseFloat(document.getElementById('price').value);
        const fees = parseFloat(document.getElementById('fees').value);
        const date = document.getElementById('transaction-date').value;
        this.transactions.push({ id: Date.now(), depotId: parseInt(depotId), securityId: parseInt(securityId), type, quantity, price, fees, date });
        this.saveTransactions();
        this.showOverview();
        document.getElementById('transaction-form').reset();
    }

    showOverview() {
        const depotId = document.getElementById('depot-select').value;
        if (!depotId) return;
        const depotTrans = this.transactions.filter(t => t.depotId == depotId);
        const overview = document.getElementById('depot-overview');
        overview.innerHTML = '<table><thead><tr><th>Wertpapier</th><th>Anzahl</th><th>Durchschnittspreis</th><th>Aktueller Wert</th><th>Gewinn/Verlust</th></tr></thead><tbody></tbody></table>';
        const tbody = overview.querySelector('tbody');
        const securities = JSON.parse(localStorage.getItem('securities')) || [];
        const prices = JSON.parse(localStorage.getItem('securityPrices')) || {};

        const positions = {};
        depotTrans.forEach(trans => {
            if (!positions[trans.securityId]) positions[trans.securityId] = { quantity: 0, cost: 0, fees: 0 };
            if (trans.type === 'buy') {
                positions[trans.securityId].quantity += trans.quantity;
                positions[trans.securityId].cost += trans.quantity * trans.price + trans.fees;
            } else if (trans.type === 'sell') {
                positions[trans.securityId].quantity -= trans.quantity;
                positions[trans.securityId].cost -= trans.quantity * trans.price - trans.fees; // Gebühren bei Verkauf abziehen?
            }
            // Dividende und Zinsen nicht in Position
        });

        Object.keys(positions).forEach(secId => {
            const pos = positions[secId];
            if (pos.quantity > 0) {
                const sec = securities.find(s => s.id == secId);
                const currentPrice = this.getCurrentPrice(secId, prices);
                const currentValue = pos.quantity * currentPrice;
                const pnl = currentValue - pos.cost;
                tbody.innerHTML += `<tr>
                    <td>${sec.name}</td>
                    <td>${pos.quantity}</td>
                    <td>${(pos.cost / pos.quantity).toFixed(2)} €</td>
                    <td>${currentValue.toFixed(2)} €</td>
                    <td>${pnl.toFixed(2)} €</td>
                </tr>`;
            }
        });
    }

    getCurrentPrice(securityId, prices) {
        if (!prices[securityId]) return 0;
        const sorted = prices[securityId].sort((a,b) => new Date(b.date) - new Date(a.date));
        return sorted[0].value;
    }

    saveDepots() {
        localStorage.setItem('depots', JSON.stringify(this.depots));
    }

    saveTransactions() {
        localStorage.setItem('depotTransactions', JSON.stringify(this.transactions));
    }
}