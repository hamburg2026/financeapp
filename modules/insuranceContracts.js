// modules/insuranceContracts.js
import { formatNumber } from '../utils.js';

export class InsuranceContracts {
    constructor() {
        this.contracts = JSON.parse(localStorage.getItem('insuranceContracts')) || [];
        this.editingId = null;
    }

    render(container) {
        container.innerHTML = `
            <div class="module">
                <h2>Versicherungsverträge</h2>
                <form id="contract-form">
                    <input type="text" id="contract-name" placeholder="Vertragsname" required>
                    <input type="text" id="contract-provider" placeholder="Anbieter" required>
                    <input type="number" id="contract-value" placeholder="Aktueller Wert" step="0.01" required>
                    <input type="date" id="contract-start" placeholder="Startdatum" required>
                    <input type="date" id="contract-end" placeholder="Enddatum" required>
                    <textarea id="contract-notes" placeholder="Notizen"></textarea>
                    <button type="submit" id="submit-contract">Vertrag hinzufügen</button>
                    <button type="button" id="cancel-contract" style="display:none">Abbrechen</button>
                </form>
                <h3>Verträge</h3>
                <table id="contracts-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Anbieter</th>
                            <th>Wert</th>
                            <th>Start</th>
                            <th>Ende</th>
                            <th>Aktionen</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        `;
        this.populateContracts();
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('contract-form').addEventListener('submit', (e) => {
            e.preventDefault();
            if (this.editingId) {
                this.updateContract();
            } else {
                this.addContract();
            }
        });
        document.getElementById('cancel-contract').addEventListener('click', () => {
            this.editingId = null;
            document.getElementById('submit-contract').textContent = 'Vertrag hinzufügen';
            document.getElementById('cancel-contract').style.display = 'none';
            document.getElementById('contract-form').reset();
        });
    }

    addContract() {
        const name = document.getElementById('contract-name').value;
        const provider = document.getElementById('contract-provider').value;
        const value = parseFloat(document.getElementById('contract-value').value);
        const start = document.getElementById('contract-start').value;
        const end = document.getElementById('contract-end').value;
        const notes = document.getElementById('contract-notes').value;
        this.contracts.push({ id: Date.now(), name, provider, value, start, end, notes });
        this.saveContracts();
        this.populateContracts();
        document.getElementById('contract-form').reset();
    }

    updateContract() {
        const name = document.getElementById('contract-name').value;
        const provider = document.getElementById('contract-provider').value;
        const value = parseFloat(document.getElementById('contract-value').value);
        const start = document.getElementById('contract-start').value;
        const end = document.getElementById('contract-end').value;
        const notes = document.getElementById('contract-notes').value;
        const con = this.contracts.find(c => c.id == this.editingId);
        if (con) {
            con.name = name;
            con.provider = provider;
            con.value = value;
            con.start = start;
            con.end = end;
            con.notes = notes;
            this.saveContracts();
            this.populateContracts();
        }
        this.editingId = null;
        document.getElementById('submit-contract').textContent = 'Vertrag hinzufügen';
        document.getElementById('cancel-contract').style.display = 'none';
        document.getElementById('contract-form').reset();
    }

    populateContracts() {
        const tbody = document.querySelector('#contracts-table tbody');
        tbody.innerHTML = '';
        this.contracts.forEach(contract => {
            const row = `<tr>
                <td>${contract.name}</td>
                <td>${contract.provider}</td>
                <td>${formatNumber(contract.value)} €</td>
                <td>${contract.start}</td>
                <td>${contract.end}</td>
                <td><button onclick="editContract(${contract.id})">Bearbeiten</button> <button onclick="removeContract(${contract.id})">Löschen</button></td>
            </tr>`;
            tbody.innerHTML += row;
        });
    }

    removeContract(id) {
        this.contracts = this.contracts.filter(con => con.id !== id);
        this.saveContracts();
        this.populateContracts();
    }

    saveContracts() {
        localStorage.setItem('insuranceContracts', JSON.stringify(this.contracts));
    }
}

window.removeContract = function(id) {
    const module = new InsuranceContracts();
    module.removeContract(id);
};

window.editContract = function(id) {
    const module = new InsuranceContracts();
    const con = module.contracts.find(c => c.id == id);
    if (con) {
        module.editingId = id;
        document.getElementById('contract-name').value = con.name;
        document.getElementById('contract-provider').value = con.provider;
        document.getElementById('contract-value').value = con.value;
        document.getElementById('contract-start').value = con.start;
        document.getElementById('contract-end').value = con.end;
        document.getElementById('contract-notes').value = con.notes;
        document.getElementById('submit-contract').textContent = 'Speichern';
        document.getElementById('cancel-contract').style.display = 'inline-block';
    }
};