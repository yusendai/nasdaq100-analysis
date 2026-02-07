/**
 * Stock detail page logic
 */

async function loadStockData(symbol) {
    try {
        const resp = await fetch(`data/stocks/${symbol}.json`);
        return await resp.json();
    } catch (e) {
        console.error(`Failed to load ${symbol}:`, e);
        return null;
    }
}

function renderMetricCards(data) {
    const m = data.metrics;
    const t = data.technicals;
    const container = document.getElementById('metric-cards');

    const ytdColor = colorForValue(m.ytdReturn);
    const changeColor = colorForValue(m.lastChange);
    const rsiCol = rsiColor(t.rsi);

    const cards = [
        { label: 'Price', value: `$${formatNumber(m.currentPrice)}`, sub: `<span style="color:${changeColor}">${formatPercent(m.lastChange)}</span> today`, color: '#f9fafb' },
        { label: 'YTD Return', value: formatPercent(m.ytdReturn), sub: `from $${formatNumber(m.ytdStartPrice)}`, color: ytdColor },
        { label: 'RSI (14)', value: t.rsi != null ? t.rsi.toFixed(1) : '-', sub: rsiLabel(t.rsi), color: rsiCol },
        { label: 'MACD Signal', value: t.macdSignal || '-', sub: '', color: t.macdSignal === 'bullish' ? COLORS.gain : t.macdSignal === 'bearish' ? COLORS.loss : COLORS.text },
        { label: 'Max Drawdown', value: formatPercent(m.maxDrawdown), sub: '', color: COLORS.loss },
        { label: 'Volatility', value: formatPercent(m.volatility), sub: 'annualized', color: '#f9fafb' },
        { label: 'Avg Volume', value: formatVolume(m.avgVolume), sub: '', color: '#f9fafb' },
    ];

    container.innerHTML = cards.map(c => `
        <div class="metric-card">
            <div class="label">${c.label}</div>
            <div class="value" style="color: ${c.color}">${c.value}</div>
            ${c.sub ? `<div class="sub text-gray-400">${c.sub}</div>` : ''}
        </div>
    `).join('');
}

function renderKeyStats(data) {
    const m = data.metrics;
    const container = document.getElementById('key-stats');
    const stats = [
        { label: 'Market Cap', value: formatMarketCap(data.marketCap) },
        { label: '52W High', value: `$${formatNumber(m.high52w)}` },
        { label: '52W Low', value: `$${formatNumber(m.low52w)}` },
        { label: 'Above MA50', value: data.technicals.aboveMa50 === true ? 'Yes' : data.technicals.aboveMa50 === false ? 'No' : '-' },
        { label: 'Above MA200', value: data.technicals.aboveMa200 === true ? 'Yes' : data.technicals.aboveMa200 === false ? 'No' : '-' },
        { label: 'YTD Start', value: `$${formatNumber(m.ytdStartPrice)}` },
        { label: 'Trading Days', value: data.priceHistory ? data.priceHistory.length : '-' },
        { label: 'Sector', value: data.sector || '-' },
    ];

    container.innerHTML = stats.map(s => `
        <div>
            <div class="text-xs text-gray-500 uppercase tracking-wider">${s.label}</div>
            <div class="text-sm font-bold text-white mt-1">${s.value}</div>
        </div>
    `).join('');
}

async function init() {
    const params = new URLSearchParams(window.location.search);
    const symbol = params.get('symbol');

    if (!symbol) {
        document.body.innerHTML = '<div class="text-center py-20 text-gray-400">No symbol specified. <a href="index.html" class="text-blue-400">Go to Dashboard</a></div>';
        return;
    }

    document.title = `${symbol} - Nasdaq 100 Analysis`;

    const data = await loadStockData(symbol);
    if (!data) {
        document.body.innerHTML = `<div class="text-center py-20 text-gray-400">Failed to load data for ${symbol}. <a href="index.html" class="text-blue-400">Go to Dashboard</a></div>`;
        return;
    }

    // Header
    document.getElementById('stock-title').textContent = `${data.symbol} - ${data.name}`;
    document.getElementById('stock-sector').textContent = data.sector || '';

    // Metric cards
    renderMetricCards(data);

    // Charts
    const dates = data.indicators?.dates || data.priceHistory.map(d => d.date);
    const closes = data.priceHistory.map(d => d.close);

    drawCandlestickChart(document.getElementById('candlestick-chart'), data);

    if (data.indicators?.rsi) {
        drawRSIChart(document.getElementById('rsi-chart'), dates, data.indicators.rsi);
    }

    if (data.indicators?.macd) {
        drawMACDChart(document.getElementById('macd-chart'), dates, data.indicators.macd);
    }

    if (data.indicators?.bollinger) {
        drawBollingerChart(document.getElementById('bollinger-chart'), dates, closes, data.indicators.bollinger);
    }

    // Key stats
    renderKeyStats(data);
}

init();
