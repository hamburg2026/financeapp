// modules/categories.js
import { formatNumber } from '../utils.js';

export class Categories {
    constructor() {
        this.categories = JSON.parse(localStorage.getItem('categories')) || [];
        this.editingId = null;
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
                    <button type="submit" id="submit-category">Kategorie hinzufügen</button>
                    <button type="button" id="cancel-category" style="display:none">Abbrechen</button>
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
            if (this.editingId) {
                this.updateCategory();
            } else {
                this.addCategory();
            }
        });
        document.getElementById('cancel-category').addEventListener('click', () => {
            this.editingId = null;
            document.getElementById('submit-category').textContent = 'Kategorie hinzufügen';
            document.getElementById('cancel-category').style.display = 'none';
            document.getElementById('category-form').reset();
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

    updateCategory() {
        const name = document.getElementById('category-name').value;
        const parent = document.getElementById('parent-category').value || null;
        const cat = this.categories.find(c => c.id == this.editingId);
        if (cat) {
            cat.name = name;
            cat.parent = parent;
            this.saveCategories();
            this.populateCategories();
        }
        this.editingId = null;
        document.getElementById('submit-category').textContent = 'Kategorie hinzufügen';
        document.getElementById('cancel-category').style.display = 'none';
        document.getElementById('category-form').reset();
    }

    populateCategories() {
        const list = document.getElementById('categories-list');
        const select = document.getElementById('parent-category');
        select.innerHTML = '<option value="">Hauptkategorie</option>';
        list.innerHTML = '<div class="category-tree"></div>';

        const treeContainer = list.querySelector('.category-tree');
        const buildTree = (parentId = null) => {
            this.categories
                .filter(cat => cat.parent == parentId)
                .forEach(cat => {
                    const hasChildren = this.categories.some(c => c.parent == cat.id);
                    
                    const node = document.createElement('div');
                    node.className = 'tree-node';
                    
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'tree-item';
                    
                    const toggle = document.createElement('span');
                    toggle.className = hasChildren ? 'tree-toggle' : 'tree-toggle empty';
                    toggle.textContent = hasChildren ? '▶' : '•';
                    if (hasChildren) {
                        toggle.onclick = () => {
                            const children = itemDiv.nextElementSibling;
                            if (children) {
                                if (children.style.display === 'none') {
                                    children.style.display = 'block';
                                    toggle.textContent = '▼';
                                } else {
                                    children.style.display = 'none';
                                    toggle.textContent = '▶';
                                }
                            }
                        };
                    }
                    
                    const label = document.createElement('span');
                    label.className = 'tree-label';
                    label.textContent = cat.name;
                    
                    const editBtn = document.createElement('button');
                    editBtn.className = 'tree-btn';
                    editBtn.textContent = '✎';
                    editBtn.onclick = () => editCategory(cat.id);
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'tree-btn';
                    deleteBtn.textContent = '✕';
                    deleteBtn.onclick = () => this.removeCategory(cat.id);
                    
                    itemDiv.appendChild(toggle);
                    itemDiv.appendChild(label);
                    itemDiv.appendChild(editBtn);
                    itemDiv.appendChild(deleteBtn);
                    node.appendChild(itemDiv);
                    
                    if (hasChildren) {
                        const childrenDiv = document.createElement('div');
                        childrenDiv.className = 'tree-children';
                        childrenDiv.style.display = 'none';
                        
                        const buildChildren = (pid) => {
                            this.categories
                                .filter(c => c.parent == pid)
                                .forEach(child => {
                                    const childHasChildren = this.categories.some(c => c.parent == child.id);
                                    const childNode = document.createElement('div');
                                    childNode.className = 'tree-node';
                                    childNode.style.marginLeft = '20px';
                                    
                                    const childItem = document.createElement('div');
                                    childItem.className = 'tree-item';
                                    
                                    const childToggle = document.createElement('span');
                                    childToggle.className = childHasChildren ? 'tree-toggle' : 'tree-toggle empty';
                                    childToggle.textContent = childHasChildren ? '▶' : '•';
                                    if (childHasChildren) {
                                        childToggle.onclick = () => {
                                            const grandchildren = childItem.nextElementSibling;
                                            if (grandchildren) {
                                                if (grandchildren.style.display === 'none') {
                                                    grandchildren.style.display = 'block';
                                                    childToggle.textContent = '▼';
                                                } else {
                                                    grandchildren.style.display = 'none';
                                                    childToggle.textContent = '▶';
                                                }
                                            }
                                        };
                                    }
                                    
                                    const childLabel = document.createElement('span');
                                    childLabel.className = 'tree-label';
                                    childLabel.textContent = child.name;
                                    
                                    const childEdit = document.createElement('button');
                                    childEdit.className = 'tree-btn';
                                    childEdit.textContent = '✎';
                                    childEdit.onclick = () => editCategory(child.id);
                                    const childBtn = document.createElement('button');
                                    childBtn.className = 'tree-btn';
                                    childBtn.textContent = '✕';
                                    childBtn.onclick = () => this.removeCategory(child.id);
                                    
                                    childItem.appendChild(childToggle);
                                    childItem.appendChild(childLabel);
                                    childItem.appendChild(childEdit);
                                    childItem.appendChild(childBtn);
                                    childNode.appendChild(childItem);
                                    
                                    if (childHasChildren) {
                                        const grandchildrenDiv = document.createElement('div');
                                        grandchildrenDiv.className = 'tree-children';
                                        grandchildrenDiv.style.display = 'none';
                                        grandchildrenDiv.style.marginLeft = '20px';
                                        
                                        this.categories
                                            .filter(gc => gc.parent == child.id)
                                            .forEach(grandchild => {
                                                const gcNode = document.createElement('div');
                                                gcNode.className = 'tree-node';
                                                gcNode.style.marginLeft = '20px';
                                                
                                                const gcItem = document.createElement('div');
                                                gcItem.className = 'tree-item';
                                                
                                                const gcToggle = document.createElement('span');
                                                gcToggle.className = 'tree-toggle empty';
                                                gcToggle.textContent = '•';
                                                
                                                const gcLabel = document.createElement('span');
                                                gcLabel.className = 'tree-label';
                                                gcLabel.textContent = grandchild.name;
                                                
                                                const gcEdit = document.createElement('button');
                                                gcEdit.className = 'tree-btn';
                                                gcEdit.textContent = '✎';
                                                gcEdit.onclick = () => editCategory(grandchild.id);
                                                const gcBtn = document.createElement('button');
                                                gcBtn.className = 'tree-btn';
                                                gcBtn.textContent = '✕';
                                                gcBtn.onclick = () => this.removeCategory(grandchild.id);
                                                
                                                gcItem.appendChild(gcToggle);
                                                gcItem.appendChild(gcLabel);
                                                gcItem.appendChild(gcEdit);
                                                gcItem.appendChild(gcBtn);
                                                gcNode.appendChild(gcItem);
                                                grandchildrenDiv.appendChild(gcNode);
                                            });
                                        
                                        childNode.appendChild(grandchildrenDiv);
                                    }
                                    
                                    childrenDiv.appendChild(childNode);
                                });
                        };
                        buildChildren(cat.id);
                        node.appendChild(childrenDiv);
                    }
                    
                    treeContainer.appendChild(node);
                    select.innerHTML += `<option value="${cat.id}">${hasChildren ? '► ' : '• '}${cat.name}</option>`;
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

window.editCategory = function(id) {
    const module = new Categories();
    const cat = module.categories.find(c => c.id == id);
    if (cat) {
        module.editingId = id;
        document.getElementById('category-name').value = cat.name;
        document.getElementById('parent-category').value = cat.parent || '';
        document.getElementById('submit-category').textContent = 'Speichern';
        document.getElementById('cancel-category').style.display = 'inline-block';
    }
};