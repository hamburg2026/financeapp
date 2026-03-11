// modules/realEstate.js
import { formatNumber } from '../utils.js';

export class RealEstate {
    constructor() {
        this.properties = JSON.parse(localStorage.getItem('realEstate')) || [];
        this.editingId = null;
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
                    <button type="submit" id="submit-property">Immobilie hinzufügen</button>
                    <button type="button" id="cancel-property" style="display:none">Abbrechen</button>
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
            if (this.editingId) {
                this.updateProperty();
            } else {
                this.addProperty();
            }
        });
        document.getElementById('cancel-property').addEventListener('click', () => {
            this.editingId = null;
            document.getElementById('submit-property').textContent = 'Immobilie hinzufügen';
            document.getElementById('cancel-property').style.display = 'none';
            document.getElementById('property-form').reset();
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

    updateProperty() {
        const name = document.getElementById('property-name').value;
        const purchase = parseFloat(document.getElementById('property-purchase').value);
        const current = parseFloat(document.getElementById('property-current').value);
        const notes = document.getElementById('property-notes').value;
        const prop = this.properties.find(p => p.id == this.editingId);
        if (prop) {
            prop.name = name;
            prop.purchase = purchase;
            prop.current = current;
            prop.notes = notes;
            this.saveProperties();
            this.populateProperties();
        }
        this.editingId = null;
        document.getElementById('submit-property').textContent = 'Immobilie hinzufügen';
        document.getElementById('cancel-property').style.display = 'none';
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
                <td><button onclick="editProperty(${prop.id})">Bearbeiten</button> <button onclick="removeProperty(${prop.id})">Löschen</button></td>
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

window.editProperty = function(id) {
    const module = new RealEstate();
    const prop = module.properties.find(p => p.id == id);
    if (prop) {
        module.editingId = id;
        document.getElementById('property-name').value = prop.name;
        document.getElementById('property-purchase').value = prop.purchase;
        document.getElementById('property-current').value = prop.current;
        document.getElementById('property-notes').value = prop.notes;
        document.getElementById('submit-property').textContent = 'Speichern';
        document.getElementById('cancel-property').style.display = 'inline-block';
    }
};