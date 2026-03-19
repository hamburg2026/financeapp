import { useState } from 'react'

function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => JSON.parse(localStorage.getItem(key)) || initial)
  const set = (newVal) => {
    localStorage.setItem(key, JSON.stringify(newVal))
    setValue(newVal)
  }
  return [value, set]
}

export default function BankAccounts() {
  const [accounts, setAccounts] = useLocalStorage('bankAccounts', [])
  const [transactions, setTransactions] = useLocalStorage('transactions', [])
  const categories = JSON.parse(localStorage.getItem('categories')) || []

  const [accountName, setAccountName] = useState('')
  const [accountBalance, setAccountBalance] = useState('')

  const [txAccountId, setTxAccountId] = useState('')
  const [txDate, setTxDate] = useState('')
  const [txDescription, setTxDescription] = useState('')
  const [txAmount, setTxAmount] = useState('')
  const [txCategory, setTxCategory] = useState('')

  function addAccount(e) {
    e.preventDefault()
    const newAccounts = [...accounts, { id: Date.now(), name: accountName, balance: parseFloat(accountBalance) }]
    setAccounts(newAccounts)
    setAccountName('')
    setAccountBalance('')
  }

  function removeAccount(id) {
    setAccounts(accounts.filter(a => a.id !== id))
  }

  function addTransaction(e) {
    e.preventDefault()
    const accountId = parseInt(txAccountId || accounts[0]?.id)
    const amount = parseFloat(txAmount)
    const newTx = { id: Date.now(), accountId, date: txDate, description: txDescription, amount, category: txCategory }
    const newTransactions = [...transactions, newTx]
    setTransactions(newTransactions)
    const newAccounts = accounts.map(a => a.id === accountId ? { ...a, balance: a.balance + amount } : a)
    setAccounts(newAccounts)
    setTxDate('')
    setTxDescription('')
    setTxAmount('')
    setTxCategory('')
  }

  function removeTransaction(id) {
    const tx = transactions.find(t => t.id === id)
    if (tx) {
      setAccounts(accounts.map(a => a.id === tx.accountId ? { ...a, balance: a.balance - tx.amount } : a))
      setTransactions(transactions.filter(t => t.id !== id))
    }
  }

  return (
    <div className="module">
      <h2>Bankkonten</h2>
      <form onSubmit={addAccount}>
        <input value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="Kontoname" required />
        <input type="number" value={accountBalance} onChange={e => setAccountBalance(e.target.value)} placeholder="Anfangsstand" step="0.01" required />
        <button type="submit">Konto hinzufügen</button>
      </form>
      <h3>Konten</h3>
      <table>
        <thead><tr><th>Name</th><th>Saldo</th><th>Aktionen</th></tr></thead>
        <tbody>
          {accounts.map(a => (
            <tr key={a.id}>
              <td>{a.name}</td>
              <td>{a.balance.toFixed(2)} €</td>
              <td><button onClick={() => removeAccount(a.id)}>Löschen</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Umsätze</h3>
      <form onSubmit={addTransaction}>
        <select value={txAccountId} onChange={e => setTxAccountId(e.target.value)} required>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} required />
        <input value={txDescription} onChange={e => setTxDescription(e.target.value)} placeholder="Beschreibung" required />
        <input type="number" value={txAmount} onChange={e => setTxAmount(e.target.value)} placeholder="Betrag" step="0.01" required />
        <select value={txCategory} onChange={e => setTxCategory(e.target.value)} required>
          {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <button type="submit">Umsatz hinzufügen</button>
      </form>
      <table>
        <thead><tr><th>Datum</th><th>Beschreibung</th><th>Betrag</th><th>Kategorie</th><th>Aktionen</th></tr></thead>
        <tbody>
          {transactions.map(t => (
            <tr key={t.id}>
              <td>{t.date}</td>
              <td>{t.description}</td>
              <td>{t.amount.toFixed(2)} €</td>
              <td>{t.category}</td>
              <td><button onClick={() => removeTransaction(t.id)}>Löschen</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
