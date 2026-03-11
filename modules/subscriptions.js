// modules/subscriptions.js
import { formatNumber } from '../utils.js';

export class Subscriptions {
    constructor() {
        this.subscriptions = JSON.parse(localStorage.getItem('subscriptions')) || [];
        this.editingId = null;
    }

    render(container) {
        container.innerHTML = `
            <div class="module">
                <h2>Abonnements</h2>
                <form id="subscription-form">
                    <input type="text" id="sub-name" placeholder="Name" required>
                    <input type="number" id="sub-cost" placeholder="Kosten" step="0.01" required>
                    <select id="sub-frequency" required>
                        <option value="monthly">Monatlich</option>
                        <option value="quarterly">Vierteljährlich</option>
                        <option value="yearly">Jährlich</option>
                    </select>
                    <input type="text" id="sub-cancel" placeholder="Kündigungsfrist" required>
                    <input type="date" id="sub-next" placeholder="Nächste Zahlung">
                    <button type="submit" id="submit-subscription">Abonnement hinzufügen</button>
                    <button type="button" id="cancel-subscription" style="display:none">Abbrechen</button>
                </form>
                <h3>Abonnements</h3>
                <table id="subscriptions-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Kosten</th>
                            <th>Frequenz</th>
                            <th>Kündigung</th>
                            <th>Nächste</th>
                            <th>Aktionen</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        `;
        this.populateSubscriptions();
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('subscription-form').addEventListener('submit', (e) => {
            e.preventDefault();
            if (this.editingId) {
                this.updateSubscription();
            } else {
                this.addSubscription();
            }
        });
        document.getElementById('cancel-subscription').addEventListener('click', () => {
            this.editingId = null;
            document.getElementById('submit-subscription').textContent = 'Abonnement hinzufügen';
            document.getElementById('cancel-subscription').style.display = 'none';
            document.getElementById('subscription-form').reset();
        });
    }

    addSubscription() {
        const name = document.getElementById('sub-name').value;
        const cost = parseFloat(document.getElementById('sub-cost').value);
        const frequency = document.getElementById('sub-frequency').value;
        const cancel = document.getElementById('sub-cancel').value;
        const next = document.getElementById('sub-next').value;
        this.subscriptions.push({ id: Date.now(), name, cost, frequency, cancel, next });
        this.saveSubscriptions();
        this.populateSubscriptions();
        document.getElementById('subscription-form').reset();
    }

    updateSubscription() {
        const name = document.getElementById('sub-name').value;
        const cost = parseFloat(document.getElementById('sub-cost').value);
        const frequency = document.getElementById('sub-frequency').value;
        const cancel = document.getElementById('sub-cancel').value;
        const next = document.getElementById('sub-next').value;
        const sub = this.subscriptions.find(s => s.id == this.editingId);
        if (sub) {
            sub.name = name;
            sub.cost = cost;
            sub.frequency = frequency;
            sub.cancel = cancel;
            sub.next = next;
            this.saveSubscriptions();
            this.populateSubscriptions();
        }
        this.editingId = null;
        document.getElementById('submit-subscription').textContent = 'Abonnement hinzufügen';
        document.getElementById('cancel-subscription').style.display = 'none';
        document.getElementById('subscription-form').reset();
    }

    populateSubscriptions() {
        const tbody = document.querySelector('#subscriptions-table tbody');
        tbody.innerHTML = '';
        this.subscriptions.forEach(sub => {
            const row = `<tr>
                <td>${sub.name}</td>
                <td>${formatNumber(sub.cost)} €</td>
                <td>${sub.frequency}</td>
                <td>${sub.cancel}</td>
                <td>${sub.next}</td>
                <td><button onclick="editSubscription(${sub.id})">Bearbeiten</button> <button onclick="removeSubscription(${sub.id})">Löschen</button></td>
            </tr>`;
            tbody.innerHTML += row;
        });
    }

    removeSubscription(id) {
        this.subscriptions = this.subscriptions.filter(sub => sub.id !== id);
        this.saveSubscriptions();
        this.populateSubscriptions();
    }

    saveSubscriptions() {
        localStorage.setItem('subscriptions', JSON.stringify(this.subscriptions));
    }
}

window.removeSubscription = function(id) {
    const module = new Subscriptions();
    module.removeSubscription(id);
};

window.editSubscription = function(id) {
    const module = new Subscriptions();
    const sub = module.subscriptions.find(s => s.id == id);
    if (sub) {
        module.editingId = id;
        document.getElementById('sub-name').value = sub.name;
        document.getElementById('sub-cost').value = sub.cost;
        document.getElementById('sub-frequency').value = sub.frequency;
        document.getElementById('sub-cancel').value = sub.cancel;
        document.getElementById('sub-next').value = sub.next;
        document.getElementById('submit-subscription').textContent = 'Speichern';
        document.getElementById('cancel-subscription').style.display = 'inline-block';
    }
};