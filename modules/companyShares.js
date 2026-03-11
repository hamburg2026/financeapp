// modules/companyShares.js
import { formatNumber } from '../utils.js';

export class CompanyShares {
    constructor() {
        this.shares = JSON.parse(localStorage.getItem('companyShares')) || [];
    }

    render(container) {
        container.innerHTML = `
            <div class="module">
                <h2>Firmenbeteiligungen</h2>
                <form id="share-form">
                    <input type="text" id="share-company" placeholder="Firmenname" required>
                    <input type="number" id="share-percentage" placeholder="Beteiligung %" step="0.01" required>
                    <input type="number" id="share-value" placeholder="Wert" step="0.01" required>
                    <textarea id="share-notes" placeholder="Notizen"></textarea>
                    <button type="submit">Beteiligung hinzufügen</button>
                </form>
                <h3>Beteiligungen</h3>
                <table id="shares-table">
                    <thead>
                        <tr>
                            <th>Firma</th>
                            <th>Beteiligung</th>
                            <th>Wert</th>
                            <th>Aktionen</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        `;
        this.populateShares();
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('share-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addShare();
        });
    }

    addShare() {
        const company = document.getElementById('share-company').value;
        const percentage = parseFloat(document.getElementById('share-percentage').value);
        const value = parseFloat(document.getElementById('share-value').value);
        const notes = document.getElementById('share-notes').value;
        this.shares.push({ id: Date.now(), company, percentage, value, notes });
        this.saveShares();
        this.populateShares();
        document.getElementById('share-form').reset();
    }

    populateShares() {
        const tbody = document.querySelector('#shares-table tbody');
        tbody.innerHTML = '';
        this.shares.forEach(share => {
            const row = `<tr>
                <td>${share.company}</td>
                <td>${share.percentage.toFixed(2)} %</td>
                <td>${formatNumber(share.value)} €</td>
                <td><button onclick="removeShare(${share.id})">Löschen</button></td>
            </tr>`;
            tbody.innerHTML += row;
        });
    }

    removeShare(id) {
        this.shares = this.shares.filter(share => share.id !== id);
        this.saveShares();
        this.populateShares();
    }

    saveShares() {
        localStorage.setItem('companyShares', JSON.stringify(this.shares));
    }
}

window.removeShare = function(id) {
    const module = new CompanyShares();
    module.removeShare(id);
};