// app.js - Hauptmodul
import { Dashboard } from './modules/dashboard.js';
import { BankAccounts } from './modules/bankAccounts.js';
import { Categories } from './modules/categories.js';
import { RecurringPayments } from './modules/recurringPayments.js';
import { InsuranceContracts } from './modules/insuranceContracts.js';
import { Securities } from './modules/securities.js';
import { Depots } from './modules/depots.js';
import { Subscriptions } from './modules/subscriptions.js';
import { RealEstate } from './modules/realEstate.js';
import { CompanyShares } from './modules/companyShares.js';

const mainContent = document.getElementById('main-content');

const modules = {
    dashboard: new Dashboard(),
    bankAccounts: new BankAccounts(),
    categories: new Categories(),
    recurringPayments: new RecurringPayments(),
    insuranceContracts: new InsuranceContracts(),
    securities: new Securities(),
    depots: new Depots(),
    subscriptions: new Subscriptions(),
    realEstate: new RealEstate(),
    companyShares: new CompanyShares()
};

function loadModule(moduleName) {
    mainContent.innerHTML = '';
    const module = modules[moduleName];
    if (module) {
        module.render(mainContent);
    }
}

// Event Listener für Navigation
document.getElementById('dashboard-btn').addEventListener('click', () => loadModule('dashboard'));
document.getElementById('bank-btn').addEventListener('click', () => loadModule('bankAccounts'));
document.getElementById('categories-btn').addEventListener('click', () => loadModule('categories'));
document.getElementById('recurring-btn').addEventListener('click', () => loadModule('recurringPayments'));
document.getElementById('insurance-btn').addEventListener('click', () => loadModule('insuranceContracts'));
document.getElementById('securities-btn').addEventListener('click', () => loadModule('securities'));
document.getElementById('depots-btn').addEventListener('click', () => loadModule('depots'));
document.getElementById('subscriptions-btn').addEventListener('click', () => loadModule('subscriptions'));
document.getElementById('realestate-btn').addEventListener('click', () => loadModule('realEstate'));
document.getElementById('shares-btn').addEventListener('click', () => loadModule('companyShares'));

// Standardmäßig Dashboard laden
loadModule('dashboard');