// modules/recurringPayments.js
import { formatNumber } from '../utils.js';

export class RecurringPayments {
    constructor() {
        this.recurrings = JSON.parse(localStorage.getItem('recurringPayments')) || [];
        this.editingId = null;
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
                    <button type="submit" id="submit-recurring">Dauerauftrag hinzufügen</button>
                    <button type="button" id="cancel-recurring" style="display:none">Abbrechen</button>
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
            if (this.editingId) {
                this.updateRecurring();
            } else {
                this.addRecurring();
            }
        });
        document.getElementById('cancel-recurring').addEventListener('click', () => {
            this.editingId = null;
            document.getElementById('submit-recurring').textContent = 'Dauerauftrag hinzufügen';
            document.getElementById('cancel-recurring').style.display = 'none';
            document.getElementById('recurring-form').reset();
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

    updateRecurring() {
        const description = document.getElementById('recurring-description').value;
        const amount = parseFloat(document.getElementById('recurring-amount').value);
        const frequency = document.getElementById('recurring-frequency').value;
        const accountId = document.getElementById('recurring-account').value;
        const rec = this.recurrings.find(r => r.id == this.editingId);
        if (rec) {
            rec.description = description;
            rec.amount = amount;
            rec.frequency = frequency;
            rec.accountId = parseInt(accountId);
            this.saveRecurrings();
            this.populateRecurrings();
        }
        this.editingId = null;
        document.getElementById('submit-recurring').textContent = 'Dauerauftrag hinzufügen';
        document.getElementById('cancel-recurring').style.display = 'none';
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
                <td>
                    <button onclick="editRecurring(${rec.id})">Bearbeiten</button>
                    <button onclick="removeRecurring(${rec.id})">Löschen</button>
                </td>
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
        // Datum abfragen
        const date = prompt('Ausführungsdatum eingeben (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
        if (!date) {
            alert('Ausführung abgebrochen');
            return;
        }
        const transactions = JSON.parse(localStorage.getItem('transactions')) || [];
        this.recurrings.forEach(rec => {
            transactions.push({
                id: Date.now() + Math.random(),
                accountId: rec.accountId,
                date,
                description: rec.description,
                amount: rec.amount,
                category: 'Dauerauftrag'
            });
            // Konto aktualisieren
            const accounts = JSON.parse(localStorage.getItem('bankAccounts')) || [];
            const account = accounts.find(a => a.id == rec.accountId);
            if (account) {
                account.balance += rec.amount;
            }
            localStorage.setItem('bankAccounts', JSON.stringify(accounts));
        });
        localStorage.setItem('transactions', JSON.stringify(transactions));
        alert(`${this.recurrings.length} Daueraufträge am ${date} ausgeführt`);
    }

    saveRecurrings() {
        localStorage.setItem('recurringPayments', JSON.stringify(this.recurrings));
    }
}

window.removeRecurring = function(id) {
    const module = new RecurringPayments();
    module.removeRecurring(id);
};

window.editRecurring = function(id) {
    const module = new RecurringPayments();
    const rec = module.recurrings.find(r => r.id == id);
    if (rec) {
        module.editingId = id;
        document.getElementById('recurring-description').value = rec.description;
        document.getElementById('recurring-amount').value = rec.amount;
        document.getElementById('recurring-frequency').value = rec.frequency;
        document.getElementById('recurring-account').value = rec.accountId;
        document.getElementById('submit-recurring').textContent = 'Speichern';
        document.getElementById('cancel-recurring').style.display = 'inline-block';
    }
};