// modules/recurringPayments.js
import { formatNumber } from '../utils.js';

export class RecurringPayments {
    constructor() {
        this.recurrings = JSON.parse(localStorage.getItem('recurringPayments')) || [];
    }

    render(container) {
        container.innerHTML = `
            <div class="module">
                <h2>Daueraufträge</h2>
                <form id="recurring-form">
                    <input type="text" id="recurring-description" placeholder="Beschreibung" required>
                    <input type="number" id="recurring-amount" placeholder="Betrag" step="0.01" required>
                    <select id="recurring-frequency" required>
                        <option value="monthly">Monatlich</option>
                        <option value="quarterly">Vierteljährlich</option>
                        <option value="yearly">Jährlich</option>
                    </select>
                    <select id="recurring-account" required></select>
                    <button type="submit">Dauerauftrag hinzufügen</button>
                </form>
                <h3>Daueraufträge</h3>
                <table id="recurrings-table">
                    <thead>
                        <tr>
                            <th>Beschreibung</th>
                            <th>Betrag</th>
                            <th>Frequenz</th>
                            <th>Aktionen</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
                <button id="execute-recurring">Ausführen</button>
            </div>
        `;
        this.populateRecurrings();
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('recurring-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addRecurring();
        });
        document.getElementById('execute-recurring').addEventListener('click', () => {
            this.executeRecurrings();
        });
    }

    addRecurring() {
        const description = document.getElementById('recurring-description').value;
        const amount = parseFloat(document.getElementById('recurring-amount').value);
        const frequency = document.getElementById('recurring-frequency').value;
        const accountId = document.getElementById('recurring-account').value;
        this.recurrings.push({ id: Date.now(), description, amount, frequency, accountId: parseInt(accountId) });
        this.saveRecurrings();
        this.populateRecurrings();
        document.getElementById('recurring-form').reset();
    }

    populateRecurrings() {
        const tbody = document.querySelector('#recurrings-table tbody');
        tbody.innerHTML = '';
        this.recurrings.forEach(rec => {
            const row = `<tr>
                <td>${rec.description}</td>
                <td>${formatNumber(rec.amount)} €</td>
                <td>${rec.frequency}</td>
                <td><button onclick="removeRecurring(${rec.id})">Löschen</button></td>
            </tr>`;
            tbody.innerHTML += row;
        });
        this.updateAccountSelect();
    }

    updateAccountSelect() {
        const accounts = JSON.parse(localStorage.getItem('bankAccounts')) || [];
        const select = document.getElementById('recurring-account');
        select.innerHTML = '';
        accounts.forEach(account => {
            select.innerHTML += `<option value="${account.id}">${account.name}</option>`;
        });
    }

    removeRecurring(id) {
        this.recurrings = this.recurrings.filter(rec => rec.id !== id);
        this.saveRecurrings();
        this.populateRecurrings();
    }

    executeRecurrings() {
        // Für Einfachheit, alle ausführen (in Realität prüfen Datum)
        const transactions = JSON.parse(localStorage.getItem('transactions')) || [];
        this.recurrings.forEach(rec => {
            transactions.push({
                id: Date.now() + Math.random(),
                accountId: rec.accountId,
                date: new Date().toISOString().split('T')[0],
                description: rec.description,
                amount: rec.amount,
                category: 'Dauerauftrag'
            });
        });
        localStorage.setItem('transactions', JSON.stringify(transactions));
        alert('Daueraufträge ausgeführt');
    }

    saveRecurrings() {
        localStorage.setItem('recurringPayments', JSON.stringify(this.recurrings));
    }
}

window.removeRecurring = function(id) {
    const module = new RecurringPayments();
    module.removeRecurring(id);
};