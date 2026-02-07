/**
 * Dashboard logic for Nasdaq 100 Analysis
 */

let allStocks = [];
let summaryData = null;
const sparklineCharts = [];

async function loadSummary() {
    try {
        const resp = await fetch('data/summary.json');
        summaryData = await resp.json();
        return summaryData;
    } catch (e) {
        console.error('Failed to load summary.json:', e);
        return null;
    }
}

async function loadAllStockData() {
    if (!summaryData || !summaryData.stocks) return [];
    // Load individual stock JSON files for sparkline data
    const promises = summaryData.stocks.map(async (s) => {
        try {
            const resp = await fetch(`data/stocks/${s.symbol}.json`);
            const data = await resp.json();
            return data;
        } catch (e) {
            console.warn(`Failed to load ${s.symbol}:`, e);
            return null;
        }
    });
    return (await Promise.all(promises)).filter(Boolean);
}

function renderOverviewCards(summary) {
    const overview = summary.marketOverview;
    const container = document.getElementById('overview-cards');
    const cards = [
        { label: 'Total Stocks', value: overview.totalStocks, color: '' },
        { label: 'Avg YTD Return', value: formatPercent(overview.avgYtdReturn), color: colorForValue(overview.avgYtdReturn) },
        { label: 'Median YTD', value: formatPercent(overview.medianYtdReturn), color: colorForValue(overview.medianYtdReturn) },
        { label: 'Bullish / Bearish', value: `${overview.bullishCount} / ${overview.bearishCount}`, color: '' },
        { label: 'Above MA50', value: `${overview.aboveMa50Count} / ${overview.totalStocks}`, color: '' },
        { label: 'Above MA200', value: `${overview.aboveMa200Count} / ${overview.totalStocks}`, color: '' },
    ];

    container.innerHTML = cards.map(c => `
        <div class="metric-card">
            <div class="label">${c.label}</div>
            <div class="value" style="color: ${c.color || '#f9fafb'}">${c.value}</div>
        </div>
    `).join('');
}

function renderSectorHeatmap(summary) {
    const container = document.getElementById('sector-heatmap');
    if (!summary.sectorStats) return;

    const sectors = Object.entries(summary.sectorStats)
        .sort((a, b) => b[1].avgYtdReturn - a[1].avgYtdReturn);

    container.innerHTML = sectors.map(([sector, stats]) => {
        const pct = stats.avgYtdReturn;
        const color = pct >= 0 ? COLORS.gain : COLORS.loss;
        const bgOpacity = Math.min(Math.abs(pct) * 3, 0.4);
        const bgColor = pct >= 0 ? `rgba(34, 197, 94, ${bgOpacity})` : `rgba(239, 68, 68, ${bgOpacity})`;

        return `
            <div class="sector-tile" style="background: ${bgColor}; border: 1px solid ${color}30">
                <div class="text-xs text-gray-400">${sector}</div>
                <div class="text-lg font-bold" style="color: ${color}">${formatPercent(pct)}</div>
                <div class="text-xs text-gray-500">${stats.count} stocks | Best: ${typeof stats.bestPerformer === 'object' ? stats.bestPerformer.symbol : stats.bestPerformer}</div>
            </div>
        `;
    }).join('');
}

function renderStockTable(stocks, fullData) {
    const tbody = document.getElementById('stock-table-body');
    tbody.innerHTML = stocks.map((s, idx) => {
        const ytdColor = colorForValue(s.ytdReturn);
        const changeColor = colorForValue(s.lastChange);
        const signalClass = s.macdSignal === 'bullish' ? 'badge-bullish' : s.macdSignal === 'bearish' ? 'badge-bearish' : 'badge-neutral';
        const ma50Class = s.aboveMa50 === true ? 'ma-above' : s.aboveMa50 === false ? 'ma-below' : 'ma-unknown';
        const ma200Class = s.aboveMa200 === true ? 'ma-above' : s.aboveMa200 === false ? 'ma-below' : 'ma-unknown';
        const rsiClass = s.rsi >= 70 ? 'rsi-overbought' : s.rsi <= 30 ? 'rsi-oversold' : 'rsi-neutral';

        return `
            <tr class="border-b border-terminal-border" onclick="window.location.href='stock.html?symbol=${s.symbol}'">
                <td class="px-4 py-2.5 text-gray-500 text-xs">${idx + 1}</td>
                <td class="px-4 py-2.5 font-bold text-white">${s.symbol}</td>
                <td class="px-4 py-2.5 text-gray-300 text-xs">${s.name || ''}</td>
                <td class="px-4 py-2.5 text-gray-400 text-xs">${s.sector || ''}</td>
                <td class="px-4 py-2.5 text-right font-mono text-white">$${formatNumber(s.currentPrice)}</td>
                <td class="px-4 py-2.5 text-right font-mono" style="color: ${changeColor}">${formatPercent(s.lastChange)}</td>
                <td class="px-4 py-2.5 text-right font-mono font-bold" style="color: ${ytdColor}">${formatPercent(s.ytdReturn)}</td>
                <td class="px-4 py-2.5 text-right font-mono ${rsiClass}">${s.rsi != null ? s.rsi.toFixed(1) : '-'}</td>
                <td class="px-4 py-2.5 text-center"><span class="${signalClass}">${s.macdSignal || '-'}</span></td>
                <td class="px-4 py-2.5 text-center ${ma50Class}">${s.aboveMa50 === true ? 'Above' : s.aboveMa50 === false ? 'Below' : '-'}</td>
                <td class="px-4 py-2.5 text-center ${ma200Class}">${s.aboveMa200 === true ? 'Above' : s.aboveMa200 === false ? 'Below' : '-'}</td>
                <td class="px-4 py-2.5 text-right"><div class="sparkline-container" id="spark-${s.symbol}"></div></td>
            </tr>
        `;
    }).join('');

    // Draw sparklines
    requestAnimationFrame(() => {
        stocks.forEach(s => {
            const el = document.getElementById(`spark-${s.symbol}`);
            if (!el) return;
            const stockData = fullData.find(d => d.symbol === s.symbol);
            if (!stockData || !stockData.priceHistory) return;
            const prices = stockData.priceHistory.map(p => p.close);
            const color = (s.ytdReturn || 0) >= 0 ? COLORS.gain : COLORS.loss;
            sparklineCharts.push(drawSparkline(el, prices, color));
        });
    });
}

function renderPerformers(summary) {
    const renderList = (containerId, stocks, isGainer) => {
        const container = document.getElementById(containerId);
        if (!stocks || !stocks.length) return;
        const maxAbs = Math.max(...stocks.map(s => Math.abs(s.ytdReturn)));

        container.innerHTML = stocks.map(s => {
            const color = isGainer ? COLORS.gain : COLORS.loss;
            const barWidth = (Math.abs(s.ytdReturn) / maxAbs * 100).toFixed(1);
            return `
                <div class="performer-row cursor-pointer" onclick="window.location.href='stock.html?symbol=${s.symbol}'">
                    <span class="text-white font-bold w-16 text-xs">${s.symbol}</span>
                    <div class="flex-1">
                        <div class="performer-bar" style="width: ${barWidth}%; background: ${color}"></div>
                    </div>
                    <span class="font-mono text-xs font-bold w-20 text-right" style="color: ${color}">${formatPercent(s.ytdReturn)}</span>
                </div>
            `;
        }).join('');
    };

    if (summary.rankings) {
        renderList('top-gainers', summary.rankings.topGainers, true);
        renderList('top-losers', summary.rankings.topLosers, false);
    }
}

function populateSectorFilter(summary) {
    const select = document.getElementById('sector-filter');
    if (!summary.sectorStats) return;
    const sectors = Object.keys(summary.sectorStats).sort();
    sectors.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        select.appendChild(opt);
    });
}

function applyFilters() {
    if (!summaryData) return;
    const search = document.getElementById('search-input').value.toLowerCase();
    const sector = document.getElementById('sector-filter').value;
    const signal = document.getElementById('signal-filter').value;
    const sortBy = document.getElementById('sort-by').value;

    let filtered = [...summaryData.stocks];

    if (search) {
        filtered = filtered.filter(s =>
            s.symbol.toLowerCase().includes(search) ||
            (s.name || '').toLowerCase().includes(search)
        );
    }
    if (sector) {
        filtered = filtered.filter(s => s.sector === sector);
    }
    if (signal) {
        filtered = filtered.filter(s => s.macdSignal === signal);
    }

    // Sort
    const [field, dir] = sortBy.split('-');
    filtered.sort((a, b) => {
        let va = a[field], vb = b[field];
        if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
        if (va == null) va = dir === 'asc' ? Infinity : -Infinity;
        if (vb == null) vb = dir === 'asc' ? Infinity : -Infinity;
        return dir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });

    // Destroy old sparkline charts
    sparklineCharts.forEach(c => c.dispose());
    sparklineCharts.length = 0;

    renderStockTable(filtered, allStocks);
}

async function init() {
    const summary = await loadSummary();
    if (!summary) {
        document.body.innerHTML = '<div class="text-center py-20 text-gray-400">Failed to load data. Make sure the server is running and data/summary.json exists.</div>';
        return;
    }

    // Header info
    document.getElementById('analysis-date').textContent = summary.marketOverview?.analysisDate || '';
    document.getElementById('stock-count').textContent = `${summary.marketOverview?.totalStocks || 0} stocks`;

    // Load all stock data for sparklines
    allStocks = await loadAllStockData();

    renderOverviewCards(summary);
    renderSectorHeatmap(summary);
    populateSectorFilter(summary);
    renderPerformers(summary);

    // Initial table render (sorted by YTD return desc)
    applyFilters();

    // Filter listeners
    document.getElementById('search-input').addEventListener('input', applyFilters);
    document.getElementById('sector-filter').addEventListener('change', applyFilters);
    document.getElementById('signal-filter').addEventListener('change', applyFilters);
    document.getElementById('sort-by').addEventListener('change', applyFilters);
}

init();
