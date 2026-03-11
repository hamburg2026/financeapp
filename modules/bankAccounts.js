// modules/bankAccounts.js
import { formatNumber } from '../utils.js';

export class BankAccounts {
    constructor() {
        this.accounts = JSON.parse(localStorage.getItem('bankAccounts')) || [];
        this.transactions = JSON.parse(localStorage.getItem('transactions')) || [];
    }

    render(container) {
        container.innerHTML = `
            <div class="module">
                <h2>Bankkonten</h2>
                <form id="account-form">
                    <input type="text" id="account-name" placeholder="Kontoname" required>
                    <input type="number" id="account-balance" placeholder="Anfangsstand" step="0.01" required>
                    <button type="submit">Konto hinzufügen</button>
                </form>
                <h3>Konten</h3>
                <table id="accounts-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Saldo</th>
                            <th>Aktionen</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
                <h3>Umsätze</h3>
                <form id="transaction-form">
                    <select id="account-select" required></select>
                    <input type="date" id="transaction-date" required>
                    <input type="text" id="transaction-description" placeholder="Beschreibung" required>
                    <input type="number" id="transaction-amount" placeholder="Betrag" step="0.01" required>
                    <select id="category-select" required></select>
                    <button type="submit">Umsatz hinzufügen</button>
                </form>
                <table id="transactions-table">
                    <thead>
                        <tr>
                            <th>Datum</th>
                            <th>Beschreibung</th>
                            <th>Betrag</th>
                            <th>Kategorie</th>
                            <th>Aktionen</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        `;
        this.populateAccounts();
        this.populateTransactions();
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('account-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addAccount();
        });
        document.getElementById('transaction-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addTransaction();
        });
    }

    addAccount() {
        const name = document.getElementById('account-name').value;
        const balance = parseFloat(document.getElementById('account-balance').value);
        this.accounts.push({ id: Date.now(), name, balance });
        this.saveAccounts();
        this.populateAccounts();
        document.getElementById('account-form').reset();
    }

    populateAccounts() {
        const tbody = document.querySelector('#accounts-table tbody');
        tbody.innerHTML = '';
        this.accounts.forEach(account => {
            const row = `<tr>
                <td>${account.name}</td>
                <td>${formatNumber(account.balance)} €</td>
                <td><button onclick="removeAccount(${account.id})">Löschen</button></td>
            </tr>`;
            tbody.innerHTML += row;
        });
        this.updateAccountSelect();
    }

    removeAccount(id) {
        this.accounts = this.accounts.filter(acc => acc.id !== id);
        this.saveAccounts();
        this.populateAccounts();
    }

    updateAccountSelect() {
        const select = document.getElementById('account-select');
        select.innerHTML = '';
        this.accounts.forEach(account => {
            select.innerHTML += `<option value="${account.id}">${account.name}</option>`;
        });
    }

    addTransaction() {
        const accountId = document.getElementById('account-select').value;
        const date = document.getElementById('transaction-date').value;
        const description = document.getElementById('transaction-description').value;
        const amount = parseFloat(document.getElementById('transaction-amount').value);
        const category = document.getElementById('category-select').value;
        this.transactions.push({ id: Date.now(), accountId: parseInt(accountId), date, description, amount, category });
        this.saveTransactions();
        this.updateAccountBalance(accountId, amount);
        this.populateTransactions();
        document.getElementById('transaction-form').reset();
    }

    updateAccountBalance(accountId, amount) {
        const account = this.accounts.find(acc => acc.id == accountId);
        if (account) {
            account.balance += amount;
            this.saveAccounts();
            this.populateAccounts();
        }
    }

    populateTransactions() {
        const tbody = document.querySelector('#transactions-table tbody');
        tbody.innerHTML = '';
        const categories = JSON.parse(localStorage.getItem('categories')) || [];
        
        this.transactions.forEach(trans => {
            const account = this.accounts.find(acc => acc.id == trans.accountId);
            const category = categories.find(c => c.id == trans.category);
            const categoryName = category ? category.name : 'Unbekannt';
            
            const row = `<tr>
                <td>${trans.date}</td>
                <td>${trans.description}</td>
                <td>${formatNumber(trans.amount)} €</td>
                <td>${categoryName}</td>
                <td><button onclick="removeTransaction(${trans.id})">Löschen</button></td>
            </tr>`;
            tbody.innerHTML += row;
        });
        this.updateCategorySelect();
    }

    removeTransaction(id) {
        const trans = this.transactions.find(t => t.id === id);
        if (trans) {
            this.updateAccountBalance(trans.accountId, -trans.amount);
            this.transactions = this.transactions.filter(t => t.id !== id);
            this.saveTransactions();
            this.populateTransactions();
        }
    }

    updateCategorySelect() {
        // Kategorien aus localStorage laden
        const categories = JSON.parse(localStorage.getItem('categories')) || [];
        const select = document.getElementById('category-select');
        select.innerHTML = '';
        categories.forEach(cat => {
            select.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
        });
    }

    removeAccount(id) {
        this.accounts = this.accounts.filter(acc => acc.id !== id);
        this.saveAccounts();
        this.populateAccounts();
    }

    saveAccounts() {
        localStorage.setItem('bankAccounts', JSON.stringify(this.accounts));
    }

    saveTransactions() {
        localStorage.setItem('transactions', JSON.stringify(this.transactions));
    }
}

// Global functions for onclick
window.removeAccount = function(id) {
    const module = new BankAccounts();
    module.removeAccount(id);
};
window.removeTransaction = function(id) {
    const module = new BankAccounts();
    module.removeTransaction(id);
};