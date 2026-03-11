// modules/realEstate.js
import { formatNumber } from '../utils.js';

export class RealEstate {
    constructor() {
        this.properties = JSON.parse(localStorage.getItem('realEstate')) || [];
    }

    render(container) {
        container.innerHTML = `
            <div class="module">
                <h2>Immobilien</h2>
                <form id="property-form">
                    <input type="text" id="property-name" placeholder="Name" required>
                    <input type="number" id="property-purchase" placeholder="Anschaffungswert" step="0.01" required>
                    <input type="number" id="property-current" placeholder="Zeitwert" step="0.01" required>
                    <textarea id="property-notes" placeholder="Notizen"></textarea>
                    <button type="submit">Immobilie hinzufügen</button>
                </form>
                <h3>Immobilien</h3>
                <table id="properties-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Anschaffungswert</th>
                            <th>Zeitwert</th>
                            <th>Gewinn/Verlust</th>
                            <th>Aktionen</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        `;
        this.populateProperties();
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('property-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addProperty();
        });
    }

    addProperty() {
        const name = document.getElementById('property-name').value;
        const purchase = parseFloat(document.getElementById('property-purchase').value);
        const current = parseFloat(document.getElementById('property-current').value);
        const notes = document.getElementById('property-notes').value;
        this.properties.push({ id: Date.now(), name, purchase, current, notes });
        this.saveProperties();
        this.populateProperties();
        document.getElementById('property-form').reset();
    }

    populateProperties() {
        const tbody = document.querySelector('#properties-table tbody');
        tbody.innerHTML = '';
        this.properties.forEach(prop => {
            const pnl = prop.current - prop.purchase;
            const row = `<tr>
                <td>${prop.name}</td>
                <td>${formatNumber(prop.purchase)} €</td>
                <td>${formatNumber(prop.current)} €</td>
                <td>${formatNumber(pnl)} €</td>
                <td><button onclick="removeProperty(${prop.id})">Löschen</button></td>
            </tr>`;
            tbody.innerHTML += row;
        });
    }

    removeProperty(id) {
        this.properties = this.properties.filter(prop => prop.id !== id);
        this.saveProperties();
        this.populateProperties();
    }

    saveProperties() {
        localStorage.setItem('realEstate', JSON.stringify(this.properties));
    }
}

window.removeProperty = function(id) {
    const module = new RealEstate();
    module.removeProperty(id);
};