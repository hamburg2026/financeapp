import SwiftUI

// Port von src/components/Securities.jsx – "Wertpapiere & Depots".

enum SecuritiesSheet: Identifiable {
    case addSecurity
    case editSecurity(SecurityAsset)
    case addPrice(EntityID?)
    case editPrice(EntityID, Int, DatedValue)
    case addFx
    case editFx(String, Int, DatedValue)
    case addTx(EntityID?)
    case editTx(DepotTransaction)
    case quote(SecurityAsset)

    var id: String {
        switch self {
        case .addSecurity: return "addSecurity"
        case .editSecurity(let s): return "editSecurity-\(s.id.key)"
        case .addPrice(let id): return "addPrice-\(id?.key ?? "")"
        case .editPrice(let id, let idx, _): return "editPrice-\(id.key)-\(idx)"
        case .addFx: return "addFx"
        case .editFx(let pair, let idx, _): return "editFx-\(pair)-\(idx)"
        case .addTx(let id): return "addTx-\(id?.key ?? "")"
        case .editTx(let t): return "editTx-\(t.id.key)"
        case .quote(let s): return "quote-\(s.id.key)"
        }
    }
}

enum SecuritiesDeleteTarget {
    case security(SecurityAsset)
    case price(EntityID, Int)
    case fx(String, Int)
    case tx(EntityID)
    case depot(Depot)

    var title: String {
        switch self {
        case .security(let s): return "Wertpapier „\(s.name)“ löschen?"
        case .price: return "Kurs löschen?"
        case .fx(let pair, _): return "Devisenkurs \(pair) löschen?"
        case .tx: return "Transaktion löschen?"
        case .depot: return "Depot und alle zugehörigen Transaktionen löschen?"
        }
    }
}

/// Listeneintrag mit Index im gespeicherten Array (Bearbeiten/Löschen per Index wie in der Web-App).
private struct SecuritiesIndexedValue: Identifiable {
    let id: String
    let index: Int
    let entry: DatedValue
}

private func securitiesIndexed(_ list: [DatedValue], prefix: String) -> [SecuritiesIndexedValue] {
    list.enumerated()
        .map { SecuritiesIndexedValue(id: "\(prefix)-\($0.offset)", index: $0.offset, entry: $0.element) }
        .sorted { $0.entry.date > $1.entry.date }
}

@MainActor
struct SecuritiesView: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.appTheme) private var theme
    @Environment(\.horizontalSizeClass) private var sizeClass

    @State private var expandedPrices: Set<EntityID> = []
    @State private var expandedTx: Set<EntityID> = []
    @State private var sheet: SecuritiesSheet?
    @State private var pendingDelete: SecuritiesDeleteTarget?
    @State private var newDepotName = ""

    @State private var fetchingYahoo: Set<EntityID> = []
    @State private var yahooErr: [EntityID: String] = [:]
    @State private var fetchingFx: Set<String> = []
    @State private var fxErr: [String: String] = [:]
    @State private var fetchingAll = false
    @State private var fetchAllDone = 0
    @State private var fetchAllTotal = 0

    private var isRegular: Bool { sizeClass == .regular }

    var body: some View {
        List {
            depotsHeaderSection
            ForEach(store.depots) { depot in
                depotSection(depot)
            }
            newDepotSection
            securitiesSection
            apiInfoSection
            fxSection
        }
        .listStyle(.insetGrouped)
        .moduleBackground()
        .navigationTitle("Wertpapiere & Depots")
        .toolbar { toolbarContent }
        .sheet(item: $sheet) { s in
            sheetContent(s).environmentObject(store)
        }
        .confirmDelete(item: $pendingDelete, title: { $0.title }) { target in
            performDelete(target)
        }
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItemGroup(placement: .primaryAction) {
            if fetchingAll {
                HStack(spacing: 6) {
                    ProgressView()
                    Text("\(fetchAllDone)/\(fetchAllTotal)").font(.caption).monospacedDigit()
                }
            }
            Menu {
                Button {
                    Task { await fetchAllYahoo() }
                } label: {
                    Label("Alle Kurse abrufen (Yahoo)", systemImage: "arrow.down.circle")
                }
                .disabled(fetchingAll || store.securities.allSatisfy { $0.symbol.trimmingCharacters(in: .whitespaces).isEmpty })
                Divider()
                Button {
                    sheet = .addPrice(store.securities.first?.id)
                } label: {
                    Label("Neuer Kurs", systemImage: "eurosign.circle")
                }
                .disabled(store.securities.isEmpty)
                Button {
                    sheet = .addTx(nil)
                } label: {
                    Label("Neue Transaktion", systemImage: "arrow.left.arrow.right")
                }
                .disabled(store.depots.isEmpty || store.securities.isEmpty)
                Button {
                    sheet = .addFx
                } label: {
                    Label("Devisenkurs hinzufügen", systemImage: "dollarsign.arrow.circlepath")
                }
            } label: {
                Label("Weitere Aktionen", systemImage: "ellipsis.circle")
            }
            Button {
                sheet = .addSecurity
            } label: {
                Label("Wertpapier", systemImage: "plus")
            }
        }
    }

    // MARK: - Sheets

    @ViewBuilder
    private func sheetContent(_ s: SecuritiesSheet) -> some View {
        switch s {
        case .addSecurity:
            SecuritiesSecurityForm(existing: nil)
        case .editSecurity(let sec):
            SecuritiesSecurityForm(existing: sec)
        case .addPrice(let secId):
            SecuritiesPriceForm(securityId: secId ?? store.securities.first?.id)
        case .editPrice(let secId, let idx, let entry):
            SecuritiesPriceForm(securityId: secId, editIndex: idx, date: entry.date, value: entry.value)
        case .addFx:
            SecuritiesFxForm()
        case .editFx(let pair, let idx, let entry):
            SecuritiesFxForm(pair: pair, editIndex: idx, date: entry.date, value: entry.value)
        case .addTx(let secId):
            SecuritiesTxForm(securityId: secId ?? store.securities.first?.id, depotId: store.depots.first?.id)
        case .editTx(let t):
            SecuritiesTxForm(editing: t)
        case .quote(let sec):
            SecuritiesQuoteSheet(security: sec)
        }
    }

    // MARK: - Löschen

    private func performDelete(_ target: SecuritiesDeleteTarget) {
        switch target {
        case .security(let s):
            store.securityPrices.removeValue(forKey: s.id.key)
            store.securities.removeAll { $0.id == s.id }
        case .price(let secId, let idx):
            var list = store.securityPrices[secId.key] ?? []
            guard idx >= 0 && idx < list.count else { return }
            list.remove(at: idx)
            store.securityPrices[secId.key] = list
        case .fx(let pair, let idx):
            var list = store.fxRates[pair] ?? []
            guard idx >= 0 && idx < list.count else { return }
            list.remove(at: idx)
            store.fxRates[pair] = list
        case .tx(let id):
            store.depotTransactions.removeAll { $0.id == id }
        case .depot(let d):
            store.depots.removeAll { $0.id == d.id }
            store.depotTransactions.removeAll { $0.depotId == d.id }
        }
    }

    // MARK: - Depot-Positionen

    @ViewBuilder
    private var depotsHeaderSection: some View {
        if store.depots.isEmpty {
            Section {
                Text("Noch keine Depots vorhanden. Legen Sie unten ein neues Depot an.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } header: {
                Text("Depot-Positionen")
            }
        }
    }

    @ViewBuilder
    private func depotSection(_ depot: Depot) -> some View {
        let positions = SecuritiesCalc.depotPositions(depotId: depot.id, transactions: store.depotTransactions,
                                                      securities: store.securities, prices: store.securityPrices)
        let totalValue = positions.reduce(0.0) { $0 + $1.curValue }
        let totalCost = positions.reduce(0.0) { $0 + $1.cost }
        let totalPnl = positions.reduce(0.0) { $0 + $1.pnl }
        let totalIncome = positions.reduce(0.0) { $0 + $1.income }
        let totalPct: Double? = totalCost > 0 ? totalPnl / totalCost * 100 : nil
        Section {
            if positions.isEmpty {
                Text("Keine Positionen").font(.subheadline).foregroundStyle(.secondary)
            } else {
                if isRegular { SecuritiesPositionHeaderRow() }
                ForEach(positions) { p in
                    SecuritiesPositionRowView(row: p, regular: isRegular)
                        .contentShape(Rectangle())
                        .contextMenu {
                            if let sec = p.security {
                                Button { sheet = .quote(sec) } label: { Label("Kurs & News", systemImage: "newspaper") }
                                Button { sheet = .addTx(sec.id) } label: { Label("Neue Transaktion", systemImage: "plus") }
                            }
                        }
                }
                SecuritiesPositionTotalRow(value: totalValue, income: totalIncome, pnl: totalPnl, pct: totalPct, regular: isRegular)
            }
        } header: {
            depotHeader(depot, totalValue: totalValue, totalPnl: totalPnl, totalPct: totalPct, first: depot.id == store.depots.first?.id)
        }
    }

    private func depotHeader(_ depot: Depot, totalValue: Double, totalPnl: Double, totalPct: Double?, first: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if first {
                Text("Depot-Positionen").font(.caption.weight(.bold)).foregroundStyle(.secondary).textCase(.uppercase)
            }
            HStack(spacing: 8) {
                Text(depot.name).font(.headline).foregroundStyle(Color.primary)
                Spacer()
                Text(fmt(totalValue)).font(.headline).monospacedDigit().foregroundStyle(Color.primary)
                if let pct = totalPct {
                    Text(securitiesPct1(pct)).font(.caption.weight(.semibold)).foregroundStyle(Color.signed(pct))
                }
                if totalPnl != 0 {
                    Text(securitiesSignedMoney(totalPnl)).font(.subheadline.weight(.semibold))
                        .monospacedDigit().foregroundStyle(Color.signed(totalPnl))
                }
                Menu {
                    Button(role: .destructive) {
                        pendingDelete = .depot(depot)
                    } label: {
                        Label("Depot löschen", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .textCase(nil)
    }

    private var newDepotSection: some View {
        Section("Neues Depot") {
            HStack {
                TextField("Depotname", text: $newDepotName)
                    .onSubmit(addDepot)
                Button("+ Depot anlegen", action: addDepot)
                    .buttonStyle(.borderedProminent)
                    .tint(theme.primary)
                    .disabled(newDepotName.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }

    private func addDepot() {
        let name = newDepotName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        store.depots.append(Depot(name: name))
        newDepotName = ""
    }

    // MARK: - Wertpapiere

    private var sortedSecurities: [SecurityAsset] {
        let de = Locale(identifier: "de_DE")
        return store.securities.sorted {
            $0.name.compare($1.name, options: [.caseInsensitive], range: nil, locale: de) == .orderedAscending
        }
    }

    private var securitiesSection: some View {
        Section {
            if store.securities.isEmpty {
                Text("Noch keine Wertpapiere erfasst. Über „+“ ein Wertpapier hinzufügen.")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            ForEach(sortedSecurities) { s in
                securityRow(s)
                if expandedPrices.contains(s.id) {
                    priceRows(s)
                }
                if expandedTx.contains(s.id) {
                    txRows(s)
                }
            }
        } header: {
            HStack {
                Text("Wertpapiere")
                Spacer()
                Button {
                    sheet = .addSecurity
                } label: {
                    Label("Wertpapier", systemImage: "plus")
                        .font(.caption.weight(.semibold))
                }
                .textCase(nil)
            }
        }
    }

    private func securityTxs(_ s: SecurityAsset) -> [DepotTransaction] {
        store.depotTransactions.filter { $0.securityId == s.id }.sorted { $0.date > $1.date }
    }

    private func securityRow(_ s: SecurityAsset) -> some View {
        let latest = store.latestPrice(for: s.id)
        let txCount = store.depotTransactions.filter { $0.securityId == s.id }.count
        let pricesOpen = expandedPrices.contains(s.id)
        let txOpen = expandedTx.contains(s.id)
        let isin = s.isin.trimmingCharacters(in: .whitespaces)
        let fetching = fetchingYahoo.contains(s.id)
        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(s.name).font(.headline)
                Spacer()
                VStack(alignment: .trailing, spacing: 0) {
                    Text(latest.map { fmtCurrency($0.value, s.currency) } ?? "–")
                        .font(.headline).monospacedDigit()
                    if let d = latest?.date, !d.isEmpty {
                        Text(fmtDate(d)).font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
            HStack(spacing: 6) {
                if !s.symbol.isEmpty {
                    Text(s.symbol).font(.caption).foregroundStyle(.secondary)
                }
                if !isin.isEmpty {
                    Button {
                        sheet = .quote(s)
                    } label: {
                        Text(isin).font(.caption.monospaced()).underline().foregroundStyle(theme.primary)
                    }
                    .buttonStyle(.borderless)
                } else {
                    Button {
                        sheet = .editSecurity(s)
                    } label: {
                        Badge(text: "+ ISIN", color: Color.warning, background: Color(hex: 0xfef9c3))
                    }
                    .buttonStyle(.borderless)
                }
                Badge(text: s.type.rawValue)
                Text(s.currency)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(s.currency != "EUR" ? Color.warning : Color.mutedText)
            }
            HStack(spacing: 8) {
                toggleButton(title: "Kurse", open: pricesOpen, tint: Color(hex: 0x0369a1)) {
                    toggle(&expandedPrices, s.id)
                }
                toggleButton(title: txCount > 0 ? "Tx (\(txCount))" : "Tx", open: txOpen, tint: Color(hex: 0x166534)) {
                    toggle(&expandedTx, s.id)
                }
                Spacer()
                Button {
                    Task { await fetchYahoo(s, expand: true) }
                } label: {
                    if fetching {
                        ProgressView().controlSize(.small)
                    } else {
                        Label("Yahoo", systemImage: "arrow.down")
                    }
                }
                .buttonStyle(.bordered)
                .tint(Color(hex: 0x15803d))
                .controlSize(.small)
                .disabled(fetching)
                securityMenu(s)
            }
            if let err = yahooErr[s.id] {
                Text(err).font(.caption).foregroundStyle(Color.expense)
            }
        }
        .padding(.vertical, 2)
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) { pendingDelete = .security(s) } label: { Label("Löschen", systemImage: "trash") }
            Button { sheet = .editSecurity(s) } label: { Label("Bearbeiten", systemImage: "pencil") }.tint(.gray)
        }
        .contextMenu { securityMenuItems(s) }
    }

    private func securityMenu(_ s: SecurityAsset) -> some View {
        Menu {
            securityMenuItems(s)
        } label: {
            Image(systemName: "ellipsis.circle").imageScale(.large)
        }
        .buttonStyle(.borderless)
    }

    @ViewBuilder
    private func securityMenuItems(_ s: SecurityAsset) -> some View {
        Button { sheet = .addPrice(s.id) } label: { Label("+ Kurs", systemImage: "eurosign.circle") }
        Button { sheet = .addTx(s.id) } label: {
            Label(store.depots.isEmpty ? "+ Tx (zuerst ein Depot anlegen)" : "+ Tx", systemImage: "arrow.left.arrow.right")
        }
        .disabled(store.depots.isEmpty)
        Button { sheet = .quote(s) } label: { Label("Kurs & News", systemImage: "newspaper") }
        Divider()
        Button { sheet = .editSecurity(s) } label: { Label("Bearbeiten", systemImage: "pencil") }
        Button(role: .destructive) { pendingDelete = .security(s) } label: { Label("Löschen", systemImage: "trash") }
    }

    private func toggleButton(title: String, open: Bool, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 3) {
                Image(systemName: open ? "chevron.down" : "chevron.right").font(.caption2.weight(.bold))
                Text(title).font(.caption.weight(.semibold))
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .foregroundStyle(open ? tint : Color.secondary)
            .background(open ? tint.opacity(0.12) : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 6))
        }
        .buttonStyle(.borderless)
    }

    private func toggle(_ set: inout Set<EntityID>, _ id: EntityID) {
        if set.contains(id) { set.remove(id) } else { set.insert(id) }
    }

    // MARK: Kurshistorie

    @ViewBuilder
    private func priceRows(_ s: SecurityAsset) -> some View {
        let entries = securitiesIndexed(store.prices(for: s.id), prefix: "p\(s.id.key)")
        if entries.isEmpty {
            Text("Noch keine Kurse erfasst.")
                .font(.caption).foregroundStyle(.secondary)
                .padding(.leading, 24)
        }
        ForEach(entries) { e in
            HStack(spacing: 8) {
                Text(fmtDate(e.entry.date)).foregroundStyle(.secondary).frame(minWidth: 90, alignment: .leading)
                Text(fmtCurrency(e.entry.value, s.currency, decimals: e.entry.value.rounded() == e.entry.value ? 2 : 4))
                    .fontWeight(.medium).monospacedDigit()
                Spacer()
                Button { sheet = .editPrice(s.id, e.index, e.entry) } label: { Image(systemName: "pencil") }
                    .buttonStyle(.borderless)
                Button { pendingDelete = .price(s.id, e.index) } label: { Image(systemName: "xmark").foregroundStyle(Color.expense) }
                    .buttonStyle(.borderless)
            }
            .font(.subheadline)
            .padding(.leading, 24)
            .listRowBackground(Color(.secondarySystemGroupedBackground).opacity(0.7))
            .swipeActions(edge: .trailing) {
                Button(role: .destructive) { pendingDelete = .price(s.id, e.index) } label: { Label("Löschen", systemImage: "trash") }
                Button { sheet = .editPrice(s.id, e.index, e.entry) } label: { Label("Bearbeiten", systemImage: "pencil") }.tint(.gray)
            }
        }
    }

    // MARK: Transaktionen

    @ViewBuilder
    private func txRows(_ s: SecurityAsset) -> some View {
        let txs = securityTxs(s)
        HStack(spacing: 6) {
            Text("Transaktionen").font(.caption.weight(.bold)).textCase(.uppercase)
                .foregroundStyle(Color(hex: 0x166534))
            if store.depots.isEmpty {
                Text("– Bitte zuerst ein Depot anlegen").font(.caption).foregroundStyle(Color.expense)
            }
            Spacer()
            if !store.depots.isEmpty {
                Button { sheet = .addTx(s.id) } label: { Label("Tx", systemImage: "plus").font(.caption) }
                    .buttonStyle(.borderless)
            }
        }
        .padding(.leading, 16)
        .listRowBackground(Color(hex: 0xf0fdf4))
        ForEach(txs) { t in
            txRow(t)
        }
    }

    private func txRow(_ t: DepotTransaction) -> some View {
        let total = SecuritiesTxStyle.total(t)
        let totalColor: Color = t.type.isIncome ? Color.positiveBlue : (t.type == .sell ? Color.expense : Color.income)
        return HStack(spacing: 8) {
            Text(fmtDate(t.date)).foregroundStyle(.secondary).frame(minWidth: 84, alignment: .leading)
            Badge(text: t.type.label, color: SecuritiesTxStyle.color(t.type), background: SecuritiesTxStyle.background(t.type))
            if store.depots.count > 1 {
                Text(store.depot(t.depotId)?.name ?? "Depot \(t.depotId.key)")
                    .font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            if t.type.isIncome {
                Text(fmt(t.price)).monospacedDigit()
            } else {
                Text("\(securitiesQty(t.quantity)) × \(fmt(t.price))").foregroundStyle(.secondary).monospacedDigit()
            }
            Spacer(minLength: 4)
            if t.fees > 0 {
                Text("\(fmt(t.fees)) Geb.").font(.caption).foregroundStyle(.secondary)
            }
            Text((t.type.isIncome ? "+" : "") + fmt(total))
                .fontWeight(.bold).monospacedDigit().foregroundStyle(totalColor)
                .frame(minWidth: 80, alignment: .trailing)
            if t.fromBankTx {
                Badge(text: "Konto", color: Color.positiveBlue, background: Color(hex: 0xeff6ff))
                    .help("Aus Konto-Umsatz generiert")
            }
            Button { sheet = .editTx(t) } label: { Image(systemName: "pencil") }
                .buttonStyle(.borderless)
            Button { pendingDelete = .tx(t.id) } label: { Image(systemName: "xmark").foregroundStyle(Color.expense) }
                .buttonStyle(.borderless)
        }
        .font(.subheadline)
        .padding(.leading, 16)
        .listRowBackground(Color(.secondarySystemGroupedBackground).opacity(0.7))
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) { pendingDelete = .tx(t.id) } label: { Label("Löschen", systemImage: "trash") }
            Button { sheet = .editTx(t) } label: { Label("Bearbeiten", systemImage: "pencil") }.tint(.gray)
        }
    }

    // MARK: - API-Hinweis

    private var apiInfoSection: some View {
        Section("API-Konfiguration (Kursdaten)") {
            VStack(alignment: .leading, spacing: 4) {
                (Text("Yahoo Finance ").bold() + Text("– kein API-Key erforderlich"))
                    .font(.subheadline)
                    .foregroundStyle(Color(hex: 0x166534))
                Text("Der „↓ Yahoo“-Button bei jedem Wertpapier ruft den aktuellen Kurs von Yahoo Finance ab; über das Menü oben können alle Kurse auf einmal abgerufen werden. Symbolformat: US-Aktien AAPL, Deutsche Aktien DTE.DE, ETFs VWCE.DE, Krypto BTC-EUR.")
                    .font(.caption)
                    .foregroundStyle(Color(hex: 0x166534))
            }
            .listRowBackground(Color(hex: 0xf0fdf4))
        }
    }

    // MARK: - Devisenkurse

    /// Verwendete Währungen: vorhandene Devisenkurse + Fremdwährungen der Wertpapiere.
    private var usedFxPairs: [String] {
        var result: [String] = store.fxRates.keys.sorted()
        for s in store.securities where !s.currency.isEmpty && s.currency != "EUR" {
            if !result.contains(s.currency) { result.append(s.currency) }
        }
        return result
    }

    private var fxSection: some View {
        Section {
            if usedFxPairs.isEmpty {
                Text("Keine Devisenkurse erfasst.").font(.subheadline).foregroundStyle(.secondary)
            }
            ForEach(usedFxPairs, id: \.self) { pair in
                fxPairRows(pair)
            }
        } header: {
            HStack {
                Text("Devisenkurse (je 1 Fremdwährung in EUR)")
                Spacer()
                Button {
                    sheet = .addFx
                } label: {
                    Label("Devisenkurs", systemImage: "plus").font(.caption.weight(.semibold))
                }
                .textCase(nil)
            }
        }
    }

    @ViewBuilder
    private func fxPairRows(_ pair: String) -> some View {
        let list = store.fxRates[pair] ?? []
        let entries = securitiesIndexed(list, prefix: "fx\(pair)")
        let latest = list.latest?.value
        let fetching = fetchingFx.contains(pair)
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Text(pair).fontWeight(.bold).frame(minWidth: 44, alignment: .leading)
                Text("→ EUR").font(.caption).foregroundStyle(.secondary)
                Spacer()
                Text(latest.map { fmtNum($0, 4) } ?? "–").fontWeight(.semibold).monospacedDigit()
                Button {
                    Task { await fetchFx(pair) }
                } label: {
                    if fetching {
                        ProgressView().controlSize(.small)
                    } else {
                        Label("API-Kurs", systemImage: "arrow.down")
                    }
                }
                .buttonStyle(.bordered)
                .tint(Color(hex: 0x1d4ed8))
                .controlSize(.small)
                .disabled(fetching)
            }
            if let err = fxErr[pair] {
                Text(err).font(.caption).foregroundStyle(Color.expense)
            }
        }
        ForEach(entries) { e in
            HStack(spacing: 8) {
                Text(fmtDate(e.entry.date)).foregroundStyle(.secondary).frame(minWidth: 90, alignment: .leading)
                Text(fmtNum(e.entry.value, 4)).monospacedDigit()
                Spacer()
                Button { sheet = .editFx(pair, e.index, e.entry) } label: { Image(systemName: "pencil") }
                    .buttonStyle(.borderless)
                Button { pendingDelete = .fx(pair, e.index) } label: { Image(systemName: "xmark").foregroundStyle(Color.expense) }
                    .buttonStyle(.borderless)
            }
            .font(.subheadline)
            .padding(.leading, 20)
            .swipeActions(edge: .trailing) {
                Button(role: .destructive) { pendingDelete = .fx(pair, e.index) } label: { Label("Löschen", systemImage: "trash") }
                Button { sheet = .editFx(pair, e.index, e.entry) } label: { Label("Bearbeiten", systemImage: "pencil") }.tint(.gray)
            }
        }
    }

    // MARK: - Netzwerk

    private func fetchYahoo(_ s: SecurityAsset, expand: Bool) async {
        let symbol = s.symbol.trimmingCharacters(in: .whitespaces)
        if symbol.isEmpty {
            yahooErr[s.id] = "Kein Ticker/Symbol hinterlegt."
            return
        }
        fetchingYahoo.insert(s.id)
        yahooErr[s.id] = nil
        do {
            let q = try await SecuritiesNetwork.fetchYahooPrice(symbol: symbol)
            var list = store.securityPrices[s.id.key] ?? []
            // gleicher Tag wird ersetzt statt doppelt gespeichert
            list.removeAll { $0.date == q.date }
            list.append(DatedValue(date: q.date, value: q.price))
            store.securityPrices[s.id.key] = SecuritiesCalc.sortedDesc(list)
            if expand { expandedPrices.insert(s.id) }
        } catch {
            yahooErr[s.id] = "Yahoo-Fehler: \(error.localizedDescription)"
        }
        fetchingYahoo.remove(s.id)
    }

    private func fetchAllYahoo() async {
        let list = sortedSecurities.filter { !$0.symbol.trimmingCharacters(in: .whitespaces).isEmpty }
        guard !list.isEmpty else { return }
        fetchingAll = true
        fetchAllDone = 0
        fetchAllTotal = list.count
        for s in list {
            await fetchYahoo(s, expand: false)
            fetchAllDone += 1
        }
        fetchingAll = false
    }

    private func fetchFx(_ pair: String) async {
        fetchingFx.insert(pair)
        fxErr[pair] = nil
        do {
            let q = try await SecuritiesNetwork.fetchFrankfurterFx(pair: pair)
            var list = store.fxRates[pair] ?? []
            list.append(DatedValue(date: q.date, value: q.rate))
            store.fxRates[pair] = SecuritiesCalc.sortedDesc(list)
        } catch {
            fxErr[pair] = "API-Fehler: \(error.localizedDescription)"
        }
        fetchingFx.remove(pair)
    }
}

// MARK: - Positionszeilen

private struct SecuritiesPositionHeaderRow: View {
    var body: some View {
        HStack(spacing: 6) {
            Text("Wertpapier").frame(maxWidth: .infinity, alignment: .leading)
            col("Anzahl", 70)
            col("Ø Preis", 90)
            col("Kurs", 90)
            col("Wert", 100)
            col("Erträge", 90)
            col("G/V", 100)
            col("%", 64)
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
    }

    private func col(_ t: String, _ w: CGFloat) -> some View {
        Text(t).frame(width: w, alignment: .trailing)
    }
}

private struct SecuritiesPositionRowView: View {
    let row: SecuritiesPositionRow
    let regular: Bool

    private var incomeText: String { row.income > 0 ? "+" + fmt(row.income) : "–" }
    private var pctText: String { row.pct.map { securitiesPct1($0) } ?? "–" }
    private var pctColor: Color { Color.signed(row.pct ?? 0) }

    var body: some View {
        if regular { wide } else { compact }
    }

    private var wide: some View {
        HStack(spacing: 6) {
            Text(row.name).frame(maxWidth: .infinity, alignment: .leading).lineLimit(2)
            Text(securitiesQty(row.quantity)).frame(width: 70, alignment: .trailing)
            Text(fmt(row.avgPrice)).foregroundStyle(.secondary).frame(width: 90, alignment: .trailing)
            Text(curPriceText).foregroundStyle(.secondary).frame(width: 90, alignment: .trailing)
            Text(fmt(row.curValue)).fontWeight(.semibold).frame(width: 100, alignment: .trailing)
            Text(incomeText).foregroundStyle(row.income > 0 ? Color.positiveBlue : Color.secondary)
                .frame(width: 90, alignment: .trailing)
            Text(securitiesSignedMoney(row.pnl)).fontWeight(.bold).foregroundStyle(Color.signed(row.pnl))
                .frame(width: 100, alignment: .trailing)
            Text(pctText).fontWeight(.semibold).foregroundStyle(pctColor).frame(width: 64, alignment: .trailing)
        }
        .font(.subheadline)
        .monospacedDigit()
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }

    private var curPriceText: String {
        if let p = row.curPrice, p != 0 { return fmt(p) }
        return "–"
    }

    private var compact: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(row.name).fontWeight(.semibold).lineLimit(1)
                Spacer()
                Text(fmt(row.curValue)).fontWeight(.semibold)
            }
            HStack {
                Text("\(securitiesQty(row.quantity)) × \(curPriceText) · Ø \(fmt(row.avgPrice))")
                    .foregroundStyle(.secondary)
                Spacer()
                Text(securitiesSignedMoney(row.pnl)).fontWeight(.bold).foregroundStyle(Color.signed(row.pnl))
                Text(pctText).foregroundStyle(pctColor)
            }
            .font(.caption)
            if row.income > 0 {
                Text("Erträge \(incomeText)").font(.caption).foregroundStyle(Color.positiveBlue)
            }
        }
        .monospacedDigit()
    }
}

private struct SecuritiesPositionTotalRow: View {
    let value: Double
    let income: Double
    let pnl: Double
    let pct: Double?
    let regular: Bool

    var body: some View {
        if regular {
            HStack(spacing: 6) {
                Text("Gesamt").foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
                Text(fmt(value)).frame(width: 100, alignment: .trailing)
                Text(income > 0 ? "+" + fmt(income) : "–").foregroundStyle(Color.positiveBlue).frame(width: 90, alignment: .trailing)
                Text(securitiesSignedMoney(pnl)).foregroundStyle(Color.signed(pnl)).frame(width: 100, alignment: .trailing)
                Text(pct.map { securitiesPct1($0) } ?? "–").foregroundStyle(Color.signed(pct ?? 0)).frame(width: 64, alignment: .trailing)
            }
            .font(.subheadline.weight(.bold))
            .monospacedDigit()
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        } else {
            HStack {
                Text("Gesamt").foregroundStyle(.secondary)
                Spacer()
                Text(fmt(value))
                Text(securitiesSignedMoney(pnl)).foregroundStyle(Color.signed(pnl))
            }
            .font(.subheadline.weight(.bold))
            .monospacedDigit()
        }
    }
}
