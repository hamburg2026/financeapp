// modules/categories.js
export class Categories {
    constructor() {
        this.categories = JSON.parse(localStorage.getItem('categories')) || [];
    }

    render(container) {
        container.innerHTML = `
            <div class="module">
                <h2>Kategorien</h2>
                <form id="category-form">
                    <input type="text" id="category-name" placeholder="Kategoriename" required>
                    <select id="parent-category">
                        <option value="">Hauptkategorie</option>
                    </select>
                    <button type="submit">Kategorie hinzufügen</button>
                </form>
                <h3>Kategorien</h3>
                <ul id="categories-list"></ul>
            </div>
        `;
        this.populateCategories();
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('category-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addCategory();
        });
    }

    addCategory() {
        const name = document.getElementById('category-name').value;
        const parent = document.getElementById('parent-category').value;
        this.categories.push({ id: Date.now(), name, parent: parent || null });
        this.saveCategories();
        this.populateCategories();
        document.getElementById('category-form').reset();
    }

    populateCategories() {
        const list = document.getElementById('categories-list');
        const select = document.getElementById('parent-category');
        select.innerHTML = '<option value="">Hauptkategorie</option>';
        list.innerHTML = '';

        const buildTree = (parentId = null, level = 0) => {
            this.categories.filter(cat => cat.parent == parentId).forEach(cat => {
                const indent = '  '.repeat(level);
                list.innerHTML += `<li>${indent}${cat.name} <button onclick="removeCategory(${cat.id})">Löschen</button></li>`;
                select.innerHTML += `<option value="${cat.id}">${'  '.repeat(level)}${cat.name}</option>`;
                buildTree(cat.id, level + 1);
            });
        };
        buildTree();
    }

    removeCategory(id) {
        this.categories = this.categories.filter(cat => cat.id !== id);
        // Unterkategorien auch entfernen oder neu zuweisen? Für Einfachheit entfernen
        this.categories = this.categories.filter(cat => cat.parent !== id);
        this.saveCategories();
        this.populateCategories();
    }

    saveCategories() {
        localStorage.setItem('categories', JSON.stringify(this.categories));
    }
}

window.removeCategory = function(id) {
    const module = new Categories();
    module.removeCategory(id);
};