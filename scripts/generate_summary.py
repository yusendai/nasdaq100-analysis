#!/usr/bin/env python3
"""Consolidate all NASDAQ-100 stock analyses into a single summary.json."""

import json
import os
import statistics
from collections import defaultdict

STOCKS_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'stocks')
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), '..', 'data', 'summary.json')

REQUIRED_KEYS = {'symbol', 'name', 'sector', 'marketCap', 'metrics', 'technicals', 'priceHistory', 'indicators'}


def load_stocks():
    """Load all stock JSON files and validate them."""
    stocks = []
    errors = []
    for filename in sorted(os.listdir(STOCKS_DIR)):
        if not filename.endswith('.json'):
            continue
        filepath = os.path.join(STOCKS_DIR, filename)
        with open(filepath) as f:
            data = json.load(f)
        missing = REQUIRED_KEYS - set(data.keys())
        if missing:
            errors.append(f"{filename}: missing keys {missing}")
        else:
            stocks.append(data)
    return stocks, errors


def build_stock_summary(stock):
    """Extract summary fields from a single stock."""
    return {
        'symbol': stock['symbol'],
        'name': stock['name'],
        'sector': stock['sector'],
        'ytdReturn': stock['metrics']['ytdReturn'],
        'currentPrice': stock['metrics']['currentPrice'],
        'rsi': stock['technicals']['rsi'],
        'macdSignal': stock['technicals']['macdSignal'],
        'aboveMa50': stock['technicals']['aboveMa50'],
        'aboveMa200': stock['technicals']['aboveMa200'],
        'lastChange': stock['metrics'].get('lastChange'),
        'marketCap': stock.get('marketCap'),
    }


def build_rankings(summaries):
    """Top 10 gainers and bottom 10 losers by YTD return."""
    by_ytd = sorted(summaries, key=lambda s: s['ytdReturn'], reverse=True)
    return {
        'topGainers': by_ytd[:10],
        'topLosers': by_ytd[-10:][::-1],  # worst first
    }


def build_sector_stats(summaries):
    """Group stocks by sector and compute stats."""
    sectors = defaultdict(list)
    for s in summaries:
        sectors[s['sector']].append(s)

    stats = {}
    for sector, members in sorted(sectors.items()):
        returns = [m['ytdReturn'] for m in members]
        best = max(members, key=lambda m: m['ytdReturn'])
        worst = min(members, key=lambda m: m['ytdReturn'])
        stats[sector] = {
            'avgYtdReturn': round(sum(returns) / len(returns), 4),
            'count': len(members),
            'bestPerformer': {'symbol': best['symbol'], 'ytdReturn': best['ytdReturn']},
            'worstPerformer': {'symbol': worst['symbol'], 'ytdReturn': worst['ytdReturn']},
        }
    return stats


def build_market_overview(summaries, analysis_date):
    """Compute market-wide aggregate stats."""
    returns = [s['ytdReturn'] for s in summaries]
    bullish = sum(1 for s in summaries if s['macdSignal'] == 'bullish')
    bearish = sum(1 for s in summaries if s['macdSignal'] == 'bearish')
    above_50 = sum(1 for s in summaries if s['aboveMa50'] is True)
    above_200 = sum(1 for s in summaries if s['aboveMa200'] is True)
    return {
        'avgYtdReturn': round(statistics.mean(returns), 4),
        'medianYtdReturn': round(statistics.median(returns), 4),
        'bullishCount': bullish,
        'bearishCount': bearish,
        'aboveMa50Count': above_50,
        'aboveMa200Count': above_200,
        'totalStocks': len(summaries),
        'analysisDate': analysis_date,
    }


def find_extremes(summaries):
    """Find overbought (RSI > 70) and oversold (RSI < 30) stocks."""
    overbought = [
        {'symbol': s['symbol'], 'name': s['name'], 'rsi': s['rsi'], 'ytdReturn': s['ytdReturn']}
        for s in summaries if s['rsi'] is not None and s['rsi'] > 70
    ]
    oversold = [
        {'symbol': s['symbol'], 'name': s['name'], 'rsi': s['rsi'], 'ytdReturn': s['ytdReturn']}
        for s in summaries if s['rsi'] is not None and s['rsi'] < 30
    ]
    overbought.sort(key=lambda x: x['rsi'], reverse=True)
    oversold.sort(key=lambda x: x['rsi'])
    return overbought, oversold


def main():
    stocks, errors = load_stocks()

    if errors:
        print("Validation errors:")
        for e in errors:
            print(f"  - {e}")
    print(f"Loaded {len(stocks)} stocks successfully.")

    summaries = [build_stock_summary(s) for s in stocks]

    # Use the analysis date from the first stock
    analysis_date = stocks[0].get('analysisDate', '2026-02-07')

    rankings = build_rankings(summaries)
    sector_stats = build_sector_stats(summaries)
    market_overview = build_market_overview(summaries, analysis_date)
    overbought, oversold = find_extremes(summaries)

    result = {
        'stocks': summaries,
        'rankings': rankings,
        'sectorStats': sector_stats,
        'marketOverview': market_overview,
        'overbought': overbought,
        'oversold': oversold,
    }

    with open(OUTPUT_FILE, 'w') as f:
        json.dump(result, f, indent=2)

    print(f"Wrote summary to {OUTPUT_FILE}")
    print(f"\n=== Market Overview ===")
    print(f"Total stocks: {market_overview['totalStocks']}")
    print(f"Avg YTD return: {market_overview['avgYtdReturn']:.2%}")
    print(f"Median YTD return: {market_overview['medianYtdReturn']:.2%}")
    print(f"Bullish: {market_overview['bullishCount']} | Bearish: {market_overview['bearishCount']}")
    print(f"Above MA50: {market_overview['aboveMa50Count']} | Above MA200: {market_overview['aboveMa200Count']}")
    print(f"\n=== Top 5 Gainers ===")
    for s in rankings['topGainers'][:5]:
        print(f"  {s['symbol']:6s} {s['ytdReturn']:+.2%}  (${s['currentPrice']:.2f})")
    print(f"\n=== Top 5 Losers ===")
    for s in rankings['topLosers'][:5]:
        print(f"  {s['symbol']:6s} {s['ytdReturn']:+.2%}  (${s['currentPrice']:.2f})")
    print(f"\nOverbought (RSI>70): {len(overbought)} stocks")
    for s in overbought:
        print(f"  {s['symbol']:6s} RSI={s['rsi']:.1f}")
    print(f"Oversold (RSI<30): {len(oversold)} stocks")
    for s in oversold:
        print(f"  {s['symbol']:6s} RSI={s['rsi']:.1f}")


if __name__ == '__main__':
    main()
