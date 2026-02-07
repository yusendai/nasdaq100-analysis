/**
 * ECharts utility functions for Nasdaq 100 Analysis
 */

const COLORS = {
    gain: '#22c55e',
    loss: '#ef4444',
    accent: '#3b82f6',
    grid: '#1e293b',
    text: '#6b7280',
    textLight: '#9ca3af',
    bg: '#111827',
    ma5: '#f59e0b',
    ma10: '#8b5cf6',
    ma20: '#3b82f6',
    ma50: '#ec4899',
    ma200: '#14b8a6',
    bbUpper: 'rgba(59, 130, 246, 0.3)',
    bbLower: 'rgba(59, 130, 246, 0.3)',
    bbMid: '#3b82f6',
    volume: 'rgba(59, 130, 246, 0.3)',
    volumeUp: 'rgba(34, 197, 94, 0.4)',
    volumeDown: 'rgba(239, 68, 68, 0.4)',
};

const BASE_CHART_OPTIONS = {
    backgroundColor: 'transparent',
    textStyle: { color: COLORS.text, fontFamily: 'system-ui, -apple-system, sans-serif' },
    animation: true,
    animationDuration: 600,
};

function formatNumber(num, decimals = 2) {
    if (num == null) return '-';
    return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatPercent(num) {
    if (num == null) return '-';
    const pct = (num * 100).toFixed(2);
    return (num >= 0 ? '+' : '') + pct + '%';
}

function formatMarketCap(num) {
    if (num == null) return '-';
    if (num >= 1e12) return '$' + (num / 1e12).toFixed(2) + 'T';
    if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
    return '$' + num.toLocaleString();
}

function formatVolume(num) {
    if (num == null) return '-';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return num.toString();
}

function colorForValue(val) {
    if (val == null) return COLORS.text;
    return val >= 0 ? COLORS.gain : COLORS.loss;
}

function rsiColor(rsi) {
    if (rsi == null) return COLORS.text;
    if (rsi >= 70) return COLORS.loss;
    if (rsi <= 30) return COLORS.gain;
    return COLORS.textLight;
}

function rsiLabel(rsi) {
    if (rsi == null) return 'N/A';
    if (rsi >= 70) return 'Overbought';
    if (rsi <= 30) return 'Oversold';
    return 'Neutral';
}

/**
 * Draw a mini sparkline using ECharts
 */
function drawSparkline(container, prices, color) {
    const chart = echarts.init(container, null, { renderer: 'canvas' });
    chart.setOption({
        ...BASE_CHART_OPTIONS,
        grid: { left: 0, right: 0, top: 0, bottom: 0 },
        xAxis: { show: false, type: 'category', data: prices.map((_, i) => i) },
        yAxis: { show: false, type: 'value', min: 'dataMin', max: 'dataMax' },
        series: [{
            type: 'line',
            data: prices,
            smooth: true,
            symbol: 'none',
            lineStyle: { width: 1.5, color },
            areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: color + '30' }, { offset: 1, color: 'transparent' }] } },
        }],
    });
    return chart;
}

/**
 * Draw candlestick + volume chart
 */
function drawCandlestickChart(container, data) {
    const chart = echarts.init(container, null, { renderer: 'canvas' });
    const dates = data.priceHistory.map(d => d.date);
    const ohlc = data.priceHistory.map(d => [d.open, d.close, d.low, d.high]);
    const volumes = data.priceHistory.map((d, i) => ({
        value: d.volume,
        itemStyle: { color: d.close >= d.open ? COLORS.volumeUp : COLORS.volumeDown }
    }));

    // Moving averages
    const maLines = [];
    const maConfigs = [
        { key: 'ma5', name: 'MA5', color: COLORS.ma5 },
        { key: 'ma20', name: 'MA20', color: COLORS.ma20 },
        { key: 'ma50', name: 'MA50', color: COLORS.ma50 },
    ];
    for (const ma of maConfigs) {
        if (data.indicators[ma.key]) {
            maLines.push({
                name: ma.name,
                type: 'line',
                data: data.indicators[ma.key],
                smooth: true,
                symbol: 'none',
                lineStyle: { width: 1, color: ma.color },
                xAxisIndex: 0,
                yAxisIndex: 0,
            });
        }
    }

    chart.setOption({
        ...BASE_CHART_OPTIONS,
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross' },
            backgroundColor: '#1e293b',
            borderColor: '#334155',
            textStyle: { color: '#e5e7eb', fontSize: 12 },
        },
        legend: {
            data: ['K-Line', ...maConfigs.map(m => m.name)],
            textStyle: { color: COLORS.text, fontSize: 11 },
            top: 0,
        },
        grid: [
            { left: 60, right: 20, top: 40, height: '60%' },
            { left: 60, right: 20, top: '78%', height: '15%' },
        ],
        xAxis: [
            { type: 'category', data: dates, gridIndex: 0, axisLine: { lineStyle: { color: COLORS.grid } }, axisLabel: { color: COLORS.text, fontSize: 10 }, boundaryGap: true },
            { type: 'category', data: dates, gridIndex: 1, axisLine: { lineStyle: { color: COLORS.grid } }, axisLabel: { show: false }, boundaryGap: true },
        ],
        yAxis: [
            { type: 'value', gridIndex: 0, axisLine: { lineStyle: { color: COLORS.grid } }, splitLine: { lineStyle: { color: COLORS.grid, type: 'dashed' } }, axisLabel: { color: COLORS.text, fontSize: 10 } },
            { type: 'value', gridIndex: 1, axisLine: { lineStyle: { color: COLORS.grid } }, splitLine: { show: false }, axisLabel: { color: COLORS.text, fontSize: 10, formatter: v => formatVolume(v) } },
        ],
        dataZoom: [
            { type: 'inside', xAxisIndex: [0, 1], start: 0, end: 100 },
        ],
        series: [
            {
                name: 'K-Line',
                type: 'candlestick',
                data: ohlc,
                xAxisIndex: 0,
                yAxisIndex: 0,
                itemStyle: {
                    color: COLORS.gain,
                    color0: COLORS.loss,
                    borderColor: COLORS.gain,
                    borderColor0: COLORS.loss,
                },
            },
            ...maLines,
            {
                name: 'Volume',
                type: 'bar',
                data: volumes,
                xAxisIndex: 1,
                yAxisIndex: 1,
            },
        ],
    });

    window.addEventListener('resize', () => chart.resize());
    return chart;
}

/**
 * Draw RSI chart
 */
function drawRSIChart(container, dates, rsiData) {
    const chart = echarts.init(container, null, { renderer: 'canvas' });
    chart.setOption({
        ...BASE_CHART_OPTIONS,
        tooltip: {
            trigger: 'axis',
            backgroundColor: '#1e293b',
            borderColor: '#334155',
            textStyle: { color: '#e5e7eb', fontSize: 12 },
        },
        grid: { left: 50, right: 20, top: 15, bottom: 30 },
        xAxis: { type: 'category', data: dates, axisLine: { lineStyle: { color: COLORS.grid } }, axisLabel: { color: COLORS.text, fontSize: 10 } },
        yAxis: {
            type: 'value', min: 0, max: 100,
            axisLine: { lineStyle: { color: COLORS.grid } },
            splitLine: { lineStyle: { color: COLORS.grid, type: 'dashed' } },
            axisLabel: { color: COLORS.text, fontSize: 10 },
        },
        visualMap: {
            show: false,
            pieces: [
                { lte: 30, color: COLORS.gain },
                { gt: 30, lte: 70, color: COLORS.accent },
                { gt: 70, color: COLORS.loss },
            ],
        },
        series: [
            {
                type: 'line', data: rsiData, smooth: true, symbol: 'none',
                lineStyle: { width: 1.5 },
                markLine: {
                    silent: true,
                    lineStyle: { type: 'dashed', color: COLORS.text },
                    data: [
                        { yAxis: 70, label: { formatter: '70', color: COLORS.loss, fontSize: 10 } },
                        { yAxis: 30, label: { formatter: '30', color: COLORS.gain, fontSize: 10 } },
                    ],
                },
            },
        ],
    });
    window.addEventListener('resize', () => chart.resize());
    return chart;
}

/**
 * Draw MACD chart
 */
function drawMACDChart(container, dates, macdData) {
    const chart = echarts.init(container, null, { renderer: 'canvas' });
    chart.setOption({
        ...BASE_CHART_OPTIONS,
        tooltip: {
            trigger: 'axis',
            backgroundColor: '#1e293b',
            borderColor: '#334155',
            textStyle: { color: '#e5e7eb', fontSize: 12 },
        },
        legend: {
            data: ['MACD', 'Signal', 'Histogram'],
            textStyle: { color: COLORS.text, fontSize: 10 },
            top: 0,
        },
        grid: { left: 50, right: 20, top: 30, bottom: 30 },
        xAxis: { type: 'category', data: dates, axisLine: { lineStyle: { color: COLORS.grid } }, axisLabel: { color: COLORS.text, fontSize: 10 } },
        yAxis: {
            type: 'value',
            axisLine: { lineStyle: { color: COLORS.grid } },
            splitLine: { lineStyle: { color: COLORS.grid, type: 'dashed' } },
            axisLabel: { color: COLORS.text, fontSize: 10 },
        },
        series: [
            { name: 'Histogram', type: 'bar', data: macdData.histogram.map(v => ({ value: v, itemStyle: { color: v >= 0 ? COLORS.gain : COLORS.loss } })) },
            { name: 'MACD', type: 'line', data: macdData.macd, smooth: true, symbol: 'none', lineStyle: { width: 1.5, color: COLORS.accent } },
            { name: 'Signal', type: 'line', data: macdData.signal, smooth: true, symbol: 'none', lineStyle: { width: 1.5, color: COLORS.ma5 } },
        ],
    });
    window.addEventListener('resize', () => chart.resize());
    return chart;
}

/**
 * Draw Bollinger Bands chart
 */
function drawBollingerChart(container, dates, closeData, bollinger) {
    const chart = echarts.init(container, null, { renderer: 'canvas' });
    chart.setOption({
        ...BASE_CHART_OPTIONS,
        tooltip: {
            trigger: 'axis',
            backgroundColor: '#1e293b',
            borderColor: '#334155',
            textStyle: { color: '#e5e7eb', fontSize: 12 },
        },
        legend: {
            data: ['Price', 'Upper', 'Middle', 'Lower'],
            textStyle: { color: COLORS.text, fontSize: 10 },
            top: 0,
        },
        grid: { left: 60, right: 20, top: 30, bottom: 30 },
        xAxis: { type: 'category', data: dates, axisLine: { lineStyle: { color: COLORS.grid } }, axisLabel: { color: COLORS.text, fontSize: 10 } },
        yAxis: {
            type: 'value', scale: true,
            axisLine: { lineStyle: { color: COLORS.grid } },
            splitLine: { lineStyle: { color: COLORS.grid, type: 'dashed' } },
            axisLabel: { color: COLORS.text, fontSize: 10 },
        },
        series: [
            { name: 'Price', type: 'line', data: closeData, smooth: true, symbol: 'none', lineStyle: { width: 2, color: '#f9fafb' } },
            { name: 'Upper', type: 'line', data: bollinger.upper, smooth: true, symbol: 'none', lineStyle: { width: 1, color: COLORS.bbMid, type: 'dashed' } },
            { name: 'Middle', type: 'line', data: bollinger.middle, smooth: true, symbol: 'none', lineStyle: { width: 1, color: COLORS.bbMid } },
            { name: 'Lower', type: 'line', data: bollinger.lower, smooth: true, symbol: 'none', lineStyle: { width: 1, color: COLORS.bbMid, type: 'dashed' },
                areaStyle: { color: 'transparent' }
            },
        ],
    });
    window.addEventListener('resize', () => chart.resize());
    return chart;
}
