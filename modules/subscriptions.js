// modules/subscriptions.js
export class Subscriptions {
    constructor() {
        this.subscriptions = JSON.parse(localStorage.getItem('subscriptions')) || [];
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
                    <button type="submit">Abonnement hinzufügen</button>
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
            this.addSubscription();
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

    populateSubscriptions() {
        const tbody = document.querySelector('#subscriptions-table tbody');
        tbody.innerHTML = '';
        this.subscriptions.forEach(sub => {
            const row = `<tr>
                <td>${sub.name}</td>
                <td>${sub.cost.toFixed(2)} €</td>
                <td>${sub.frequency}</td>
                <td>${sub.cancel}</td>
                <td>${sub.next}</td>
                <td><button onclick="removeSubscription(${sub.id})">Löschen</button></td>
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