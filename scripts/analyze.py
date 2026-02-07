#!/usr/bin/env python3
"""
Nasdaq 100 Stock Analyzer
Fetches YTD 2026 data and computes technical indicators for given stocks.

Usage:
    python analyze.py AAPL MSFT GOOG ...
    python analyze.py --group 1          # Analyze group_1 from nasdaq100_symbols.json
"""
from __future__ import annotations

import sys
import json
import os
import argparse
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import yfinance as yf
import pandas as pd
import numpy as np

# Project paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "data" / "stocks"
SYMBOLS_FILE = SCRIPT_DIR / "nasdaq100_symbols.json"


def compute_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """Compute Relative Strength Index."""
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.ewm(alpha=1/period, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1/period, min_periods=period).mean()
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    return rsi


def compute_macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    """Compute MACD, Signal line, and Histogram."""
    ema_fast = series.ewm(span=fast, adjust=False).mean()
    ema_slow = series.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def compute_bollinger(series: pd.Series, period: int = 20, std_dev: int = 2):
    """Compute Bollinger Bands."""
    ma = series.rolling(window=period).mean()
    std = series.rolling(window=period).std()
    upper = ma + std_dev * std
    lower = ma - std_dev * std
    return upper, ma, lower


def safe_float(val):
    """Convert numpy/pandas values to Python float, handling NaN."""
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None
    try:
        result = float(val)
        return None if np.isnan(result) or np.isinf(result) else round(result, 4)
    except (TypeError, ValueError):
        return None


def series_to_list(series: pd.Series) -> list:
    """Convert pandas Series to list of safe floats."""
    return [safe_float(v) for v in series]


def analyze_stock(symbol: str) -> Optional[dict]:
    """Fetch and analyze a single stock. Returns analysis dict or None on failure."""
    print(f"  Analyzing {symbol}...")

    try:
        ticker = yf.Ticker(symbol)

        # Fetch YTD 2026 data (from Jan 1 2026 to today)
        # Also fetch extra history for MA200 computation
        start_date = "2025-05-01"  # Extra history for long MAs
        ytd_start = "2026-01-01"
        end_date = datetime.now().strftime("%Y-%m-%d")

        hist = ticker.history(start=start_date, end=end_date)

        if hist.empty or len(hist) < 5:
            print(f"    WARNING: No sufficient data for {symbol}, skipping.")
            return None

        # Get company info
        info = ticker.info or {}
        company_name = info.get("longName") or info.get("shortName") or symbol
        sector = info.get("sector", "Unknown")
        market_cap = info.get("marketCap")

        # Split into full history (for MAs) and YTD
        ytd_data = hist[hist.index >= ytd_start].copy()
        if ytd_data.empty:
            print(f"    WARNING: No YTD 2026 data for {symbol}, skipping.")
            return None

        close = hist["Close"]
        ytd_close = ytd_data["Close"]

        # --- Key Metrics ---
        first_close = ytd_close.iloc[0]
        last_close = ytd_close.iloc[-1]
        ytd_return = (last_close - first_close) / first_close

        # Max drawdown (YTD)
        cummax = ytd_close.cummax()
        drawdown = (ytd_close - cummax) / cummax
        max_drawdown = drawdown.min()

        # Annualized volatility
        daily_returns = ytd_close.pct_change().dropna()
        volatility = daily_returns.std() * np.sqrt(252) if len(daily_returns) > 1 else 0

        # Volume
        avg_volume = int(ytd_data["Volume"].mean()) if "Volume" in ytd_data else 0

        # 52-week high/low (use full history)
        one_year_ago = datetime.now() - timedelta(days=365)
        year_data = hist[hist.index >= one_year_ago.strftime("%Y-%m-%d")]
        high_52w = float(year_data["High"].max()) if not year_data.empty else None
        low_52w = float(year_data["Low"].min()) if not year_data.empty else None

        # Last trading day change
        last_change = float(daily_returns.iloc[-1]) if len(daily_returns) > 0 else 0

        # --- Technical Indicators (computed on full history, sliced to YTD) ---
        ma5 = close.rolling(5).mean()
        ma10 = close.rolling(10).mean()
        ma20 = close.rolling(20).mean()
        ma50 = close.rolling(50).mean()
        ma200 = close.rolling(200).mean()

        rsi = compute_rsi(close)
        macd_line, signal_line, macd_hist = compute_macd(close)
        bb_upper, bb_mid, bb_lower = compute_bollinger(close)

        # Slice indicators to YTD range
        ytd_idx = ytd_data.index
        ma5_ytd = ma5.reindex(ytd_idx)
        ma10_ytd = ma10.reindex(ytd_idx)
        ma20_ytd = ma20.reindex(ytd_idx)
        ma50_ytd = ma50.reindex(ytd_idx)
        ma200_ytd = ma200.reindex(ytd_idx)
        rsi_ytd = rsi.reindex(ytd_idx)
        macd_ytd = macd_line.reindex(ytd_idx)
        signal_ytd = signal_line.reindex(ytd_idx)
        macd_hist_ytd = macd_hist.reindex(ytd_idx)
        bb_upper_ytd = bb_upper.reindex(ytd_idx)
        bb_mid_ytd = bb_mid.reindex(ytd_idx)
        bb_lower_ytd = bb_lower.reindex(ytd_idx)

        # Current technical status
        current_rsi = safe_float(rsi_ytd.iloc[-1])
        current_macd = safe_float(macd_ytd.iloc[-1])
        current_signal = safe_float(signal_ytd.iloc[-1])
        above_ma50 = bool(last_close > ma50_ytd.iloc[-1]) if pd.notna(ma50_ytd.iloc[-1]) else None
        above_ma200 = bool(last_close > ma200_ytd.iloc[-1]) if pd.notna(ma200_ytd.iloc[-1]) else None

        macd_signal_str = "neutral"
        if current_macd is not None and current_signal is not None:
            if current_macd > current_signal:
                macd_signal_str = "bullish"
            elif current_macd < current_signal:
                macd_signal_str = "bearish"

        # --- Build price history array ---
        price_history = []
        for idx, row in ytd_data.iterrows():
            price_history.append({
                "date": idx.strftime("%Y-%m-%d"),
                "open": safe_float(row["Open"]),
                "high": safe_float(row["High"]),
                "low": safe_float(row["Low"]),
                "close": safe_float(row["Close"]),
                "volume": int(row["Volume"]) if pd.notna(row.get("Volume", None)) else 0
            })

        # --- Assemble result ---
        result = {
            "symbol": symbol,
            "name": company_name,
            "sector": sector,
            "marketCap": market_cap,
            "analysisDate": end_date,
            "metrics": {
                "ytdReturn": safe_float(ytd_return),
                "maxDrawdown": safe_float(max_drawdown),
                "volatility": safe_float(volatility),
                "avgVolume": avg_volume,
                "currentPrice": safe_float(last_close),
                "high52w": safe_float(high_52w),
                "low52w": safe_float(low_52w),
                "lastChange": safe_float(last_change),
                "ytdStartPrice": safe_float(first_close),
            },
            "technicals": {
                "rsi": current_rsi,
                "macdSignal": macd_signal_str,
                "aboveMa50": above_ma50,
                "aboveMa200": above_ma200,
            },
            "priceHistory": price_history,
            "indicators": {
                "dates": [idx.strftime("%Y-%m-%d") for idx in ytd_idx],
                "ma5": series_to_list(ma5_ytd),
                "ma10": series_to_list(ma10_ytd),
                "ma20": series_to_list(ma20_ytd),
                "ma50": series_to_list(ma50_ytd),
                "ma200": series_to_list(ma200_ytd),
                "rsi": series_to_list(rsi_ytd),
                "macd": {
                    "macd": series_to_list(macd_ytd),
                    "signal": series_to_list(signal_ytd),
                    "histogram": series_to_list(macd_hist_ytd),
                },
                "bollinger": {
                    "upper": series_to_list(bb_upper_ytd),
                    "middle": series_to_list(bb_mid_ytd),
                    "lower": series_to_list(bb_lower_ytd),
                },
            },
        }

        print(f"    {symbol}: YTD Return={safe_float(ytd_return)}, RSI={current_rsi}, MACD={macd_signal_str}")
        return result

    except Exception as e:
        print(f"    ERROR analyzing {symbol}: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(description="Analyze Nasdaq 100 stocks")
    parser.add_argument("symbols", nargs="*", help="Stock symbols to analyze")
    parser.add_argument("--group", type=int, help="Group number (1-10) from nasdaq100_symbols.json")
    args = parser.parse_args()

    # Determine symbols to analyze
    symbols = args.symbols
    if args.group:
        with open(SYMBOLS_FILE) as f:
            config = json.load(f)
        group_key = f"group_{args.group}"
        if group_key not in config["groups"]:
            print(f"ERROR: Group {args.group} not found. Available: 1-10")
            sys.exit(1)
        symbols = config["groups"][group_key]

    if not symbols:
        print("ERROR: No symbols specified. Use --group N or pass symbols as arguments.")
        sys.exit(1)

    print(f"Analyzing {len(symbols)} stocks: {', '.join(symbols)}")
    print(f"Output directory: {DATA_DIR}")
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    results = {}
    failed = []

    for symbol in symbols:
        result = analyze_stock(symbol)
        if result:
            # Save individual JSON file
            output_file = DATA_DIR / f"{symbol}.json"
            with open(output_file, "w") as f:
                json.dump(result, f, indent=2)
            results[symbol] = "OK"
            print(f"    Saved: {output_file}")
        else:
            failed.append(symbol)

    # Summary
    print(f"\n{'='*50}")
    print(f"Analysis complete: {len(results)} succeeded, {len(failed)} failed")
    if failed:
        print(f"Failed symbols: {', '.join(failed)}")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
