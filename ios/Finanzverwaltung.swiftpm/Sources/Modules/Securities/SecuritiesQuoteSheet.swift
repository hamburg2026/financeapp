import SwiftUI
import Charts

// "Kurs & News"-Popup (ISIN-Klick in der Web-App).

struct SecuritiesQuoteSheet: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.appTheme) private var theme

    let security: SecurityAsset

    @State private var price: Double?
    @State private var priceDate: String = ""
    @State private var priceSource: String = ""
    @State private var priceLoading = false
    @State private var priceErr = ""
    @State private var news: [SecuritiesNewsItem] = []
    @State private var newsLoading = false
    @State private var newsErr = ""

    private let tileColumns = [GridItem(.adaptive(minimum: 130), spacing: 8)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    metaRow
                    positionCard
                    priceCard
                    chartCard
                    newsCard
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("\(security.name) – Kurs & News")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Fertig") { dismiss() } }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        Task { await load() }
                    } label: {
                        Label("Aktualisieren", systemImage: "arrow.clockwise")
                    }
                    .disabled(priceLoading || newsLoading)
                }
            }
            .task { await load() }
        }
    }

    // MARK: Abschnitte

    private var metaRow: some View {
        HStack(spacing: 6) {
            Text(security.symbol)
                .font(.caption.monospaced())
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(Color.borderGray)
                .clipShape(RoundedRectangle(cornerRadius: 4))
            if !security.isin.isEmpty {
                Text(security.isin).font(.caption.monospaced()).foregroundStyle(theme.primary)
            }
            Badge(text: security.type.rawValue)
            Text(security.currency)
                .font(.caption.weight(.semibold))
                .foregroundStyle(security.currency != "EUR" ? Color.warning : Color.mutedText)
        }
    }

    private struct PositionSummary {
        let quantity: Double
        let cost: Double
        let income: Double
        let curValue: Double?
        let capGain: Double?
        let total: Double?
        let totalPct: Double?
        let avgPrice: Double
    }

    /// Position über alle Depots (wie in Securities.jsx).
    private var summary: PositionSummary? {
        var quantity = 0.0, cost = 0.0, income = 0.0
        for t in store.depotTransactions where t.securityId == security.id {
            switch t.type {
            case .buy: quantity += t.quantity; cost += t.quantity * t.price + t.fees
            case .sell: quantity -= t.quantity; cost -= t.quantity * t.price - t.fees
            case .dividend, .interest: income += t.quantity * t.price - t.fees
            }
        }
        if quantity <= 0.0001 && income == 0 { return nil }
        let cur = SecuritiesCalc.currentPrice(store.securityPrices, security.id)
        let curValue: Double? = cur.map { quantity * $0 }
        let capGain: Double? = curValue.map { $0 - cost }
        let total: Double? = capGain.map { $0 + income }
        let totalPct: Double? = (cost > 0 && total != nil) ? total! / cost * 100 : nil
        return PositionSummary(quantity: quantity, cost: cost, income: income, curValue: curValue,
                               capGain: capGain, total: total, totalPct: totalPct,
                               avgPrice: quantity > 0 ? cost / quantity : 0)
    }

    @ViewBuilder
    private var positionCard: some View {
        if let s = summary {
            Card("Meine Position") {
                LazyVGrid(columns: tileColumns, alignment: .leading, spacing: 8) {
                    StatTile(title: "Anzahl", value: securitiesQty(s.quantity))
                    StatTile(title: "Ø Einstand", value: fmt(s.avgPrice))
                    StatTile(title: "Depotwert", value: s.curValue.map { fmt($0) } ?? "–",
                             color: (s.curValue != nil && s.curValue! >= s.cost) ? Color.income : Color.expense)
                    StatTile(title: "Kursgewinn", value: s.capGain.map { securitiesSignedMoney($0) } ?? "–",
                             color: s.capGain.map { Color.signed($0) } ?? Color.primary)
                    StatTile(title: "Erträge", value: s.income > 0 ? "+" + fmt(s.income) : "–",
                             color: s.income > 0 ? Color.positiveBlue : Color.primary)
                    StatTile(title: "Gesamt", value: totalText(s),
                             color: s.total.map { Color.signed($0) } ?? Color.primary)
                }
            }
        }
    }

    private func totalText(_ s: PositionSummary) -> String {
        guard let t = s.total else { return "–" }
        var str = securitiesSignedMoney(t)
        if let p = s.totalPct { str += " (" + securitiesPct1(p) + ")" }
        return str
    }

    private var priceCard: some View {
        Card("Aktueller Kurs") {
            if priceLoading {
                HStack(spacing: 8) {
                    ProgressView()
                    Text("Kurs wird abgerufen…").foregroundStyle(.secondary)
                }
            } else if let p = price {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text(fmtCurrency(p, security.currency))
                        .font(.largeTitle.weight(.heavy))
                        .monospacedDigit()
                    Text("Stand \(priceDate.isEmpty ? "" : fmtDate(priceDate))" + (priceSource.isEmpty ? "" : " · \(priceSource)"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if !priceErr.isEmpty {
                    Text("Hinweis: \(priceErr)").font(.caption).foregroundStyle(Color.warning)
                }
            } else {
                Text(priceErr.isEmpty ? "Kein Kurs verfügbar." : priceErr)
                    .font(.subheadline)
                    .foregroundStyle(Color.expense)
            }
        }
    }

    @ViewBuilder
    private var chartCard: some View {
        let list = store.prices(for: security.id)
        if !list.isEmpty {
            Card("Kursverlauf (\(list.count) Einträge)") {
                SecuritiesPriceChart(prices: list, currency: security.currency)
            }
        }
    }

    private var newsCard: some View {
        Card("Aktuelle News") {
            if newsLoading {
                HStack(spacing: 8) {
                    ProgressView()
                    Text("News werden geladen…").foregroundStyle(.secondary)
                }
            } else if !newsErr.isEmpty {
                Text(newsErr).font(.subheadline).foregroundStyle(Color.expense)
            } else if !news.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(news) { item in newsRow(item) }
                }
            } else if security.symbol.isEmpty {
                Text("Kein Symbol hinterlegt – News nicht abrufbar.")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private func newsRow(_ item: SecuritiesNewsItem) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Rectangle().fill(theme.primary).frame(width: 3)
            VStack(alignment: .leading, spacing: 3) {
                if let url = URL(string: item.url), !item.url.isEmpty {
                    Link(destination: url) {
                        Text(item.title)
                            .font(.subheadline.weight(.semibold))
                            .multilineTextAlignment(.leading)
                            .foregroundStyle(Color.primary)
                    }
                } else {
                    Text(item.title).font(.subheadline.weight(.semibold))
                }
                if !item.summary.isEmpty {
                    Text(item.summary).font(.caption).foregroundStyle(.secondary)
                }
                Text(item.source + (item.date.isEmpty ? "" : " · \(fmtDate(item.date))"))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    // MARK: Laden

    private func load() async {
        price = nil
        priceDate = ""
        priceSource = ""
        priceErr = ""
        news = []
        newsErr = ""

        let symbol = security.symbol.trimmingCharacters(in: .whitespaces)
        let local = SecuritiesCalc.currentPrice(store.securityPrices, security.id)

        if !symbol.isEmpty {
            priceLoading = true
            do {
                let q = try await SecuritiesNetwork.fetchYahooPrice(symbol: symbol)
                priceSource = "Yahoo Finance"
                price = q.price
                priceDate = q.date
            } catch {
                priceErr = error.localizedDescription
                if let l = local {
                    price = l
                    priceSource = "lokal"
                    priceDate = store.latestPrice(for: security.id)?.date ?? ""
                }
            }
            priceLoading = false
        } else {
            if let l = local {
                price = l
                priceSource = "lokal"
                priceDate = store.latestPrice(for: security.id)?.date ?? ""
            } else {
                priceErr = "Kein Symbol hinterlegt und kein lokaler Kurs vorhanden."
            }
        }

        if !symbol.isEmpty {
            newsLoading = true
            do {
                news = try await SecuritiesNetwork.fetchNews(symbol: symbol)
            } catch {
                newsErr = error.localizedDescription
            }
            newsLoading = false
        }
    }
}

// MARK: - Kursgrafik

private struct SecuritiesChartPoint: Identifiable {
    let id: Int
    let date: Date
    let iso: ISODate
    let value: Double
}

struct SecuritiesPriceChart: View {
    let prices: [DatedValue]
    let currency: String

    private var points: [SecuritiesChartPoint] {
        let sorted = prices.sorted { $0.date < $1.date }
        var result: [SecuritiesChartPoint] = []
        for (i, p) in sorted.enumerated() {
            if let d = ISODates.date(from: p.date) {
                result.append(SecuritiesChartPoint(id: i, date: d, iso: p.date, value: p.value))
            }
        }
        return result
    }

    var body: some View {
        let pts = points
        if pts.count < 2 {
            Text("Mindestens 2 Kurse für Grafik erforderlich.")
                .font(.caption)
                .italic()
                .foregroundStyle(.secondary)
        } else {
            chart(pts)
        }
    }

    private func chart(_ pts: [SecuritiesChartPoint]) -> some View {
        let values = pts.map { $0.value }
        let minV = values.min() ?? 0
        let maxV = values.max() ?? 1
        let range = (maxV - minV) == 0 ? 1 : (maxV - minV)
        let lower = minV - range * 0.05
        let upper = maxV + range * 0.05
        let isUp = (pts.last?.value ?? 0) >= (pts.first?.value ?? 0)
        let color: Color = isUp ? Color(hex: 0x16a34a) : Color(hex: 0xdc2626)
        let gradient = LinearGradient(colors: [color.opacity(0.25), color.opacity(0.02)],
                                      startPoint: .top, endPoint: .bottom)
        let endpoints: [SecuritiesChartPoint] = [pts[0], pts[pts.count - 1]]
        return Chart {
            ForEach(pts) { (p: SecuritiesChartPoint) in
                AreaMark(x: .value("Datum", p.date),
                         yStart: .value("Basis", lower),
                         yEnd: .value("Kurs", p.value))
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(gradient)
            }
            ForEach(pts) { (p: SecuritiesChartPoint) in
                LineMark(x: .value("Datum", p.date), y: .value("Kurs", p.value))
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(color)
                    .lineStyle(StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
            }
            ForEach(endpoints) { (p: SecuritiesChartPoint) in
                PointMark(x: .value("Datum", p.date), y: .value("Kurs", p.value))
                    .foregroundStyle(color)
                    .symbolSize(40)
            }
        }
        .chartYScale(domain: lower...upper)
        .chartYAxis {
            AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { value in
                AxisGridLine(stroke: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                AxisValueLabel {
                    if let v = value.as(Double.self) { Text(fmtCurrency(v, currency)).font(.caption2) }
                }
            }
        }
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 3)) { value in
                AxisValueLabel {
                    if let d = value.as(Date.self) { Text(fmtDate(ISODates.string(from: d))).font(.caption2) }
                }
            }
        }
        .chartPlotStyle { plot in plot.clipped() }
        .frame(height: 180)
    }
}
