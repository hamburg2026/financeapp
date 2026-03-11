// modules/securities.js
import { formatNumber } from '../utils.js';

export class Securities {
    constructor() {
        this.securities = JSON.parse(localStorage.getItem('securities')) || [];
        this.prices = JSON.parse(localStorage.getItem('securityPrices')) || {};
    }

    render(container) {
        container.innerHTML = `
            <div class="module">
                <h2>Wertpapiere</h2>
                <form id="security-form">
                    <input type="text" id="security-name" placeholder="Name" required>
                    <input type="text" id="security-symbol" placeholder="Symbol" required>
                    <input type="text" id="security-type" placeholder="Typ (Aktie, Bond, etc.)" required>
                    <button type="submit">Wertpapier hinzufügen</button>
                </form>
                <h3>Wertpapiere</h3>
                <table id="securities-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Symbol</th>
                            <th>Typ</th>
                            <th>Aktueller Kurs</th>
                            <th>Aktionen</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
                <h3>Kurse aktualisieren</h3>
                <form id="price-form">
                    <select id="security-select" required></select>
                    <input type="date" id="price-date" required>
                    <input type="number" id="price-value" placeholder="Kurs" step="0.01" required>
                    <button type="submit">Kurs hinzufügen</button>
                </form>
            </div>
        `;
        this.populateSecurities();
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('security-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addSecurity();
        });
        document.getElementById('price-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addPrice();
        });
    }

    addSecurity() {
        const name = document.getElementById('security-name').value;
        const symbol = document.getElementById('security-symbol').value;
        const type = document.getElementById('security-type').value;
        this.securities.push({ id: Date.now(), name, symbol, type });
        this.saveSecurities();
        this.populateSecurities();
        document.getElementById('security-form').reset();
    }

    populateSecurities() {
        const tbody = document.querySelector('#securities-table tbody');
        tbody.innerHTML = '';
        this.securities.forEach(sec => {
            const currentPrice = this.getCurrentPrice(sec.id);
            const row = `<tr>
                <td>${sec.name}</td>
                <td>${sec.symbol}</td>
                <td>${sec.type}</td>
                <td>${currentPrice ? formatNumber(currentPrice) + ' €' : 'N/A'}</td>
                <td><button onclick="removeSecurity(${sec.id})">Löschen</button></td>
            </tr>`;
            tbody.innerHTML += row;
        });
        this.updateSecuritySelect();
    }

    updateSecuritySelect() {
        const select = document.getElementById('security-select');
        select.innerHTML = '';
        this.securities.forEach(sec => {
            select.innerHTML += `<option value="${sec.id}">${sec.name}</option>`;
        });
    }

    removeSecurity(id) {
        this.securities = this.securities.filter(sec => sec.id !== id);
        delete this.prices[id];
        this.saveSecurities();
        this.savePrices();
        this.populateSecurities();
    }

    addPrice() {
        const securityId = document.getElementById('security-select').value;
        const date = document.getElementById('price-date').value;
        const value = parseFloat(document.getElementById('price-value').value);
        if (!this.prices[securityId]) this.prices[securityId] = [];
        this.prices[securityId].push({ date, value });
        this.savePrices();
        this.populateSecurities();
        document.getElementById('price-form').reset();
    }

    getCurrentPrice(securityId) {
        if (!this.prices[securityId]) return null;
        const sorted = this.prices[securityId].sort((a,b) => new Date(b.date) - new Date(a.date));
        return sorted[0].value;
    }

    saveSecurities() {
        localStorage.setItem('securities', JSON.stringify(this.securities));
    }

    savePrices() {
        localStorage.setItem('securityPrices', JSON.stringify(this.prices));
    }
}

window.removeSecurity = function(id) {
    const module = new Securities();
    module.removeSecurity(id);
};