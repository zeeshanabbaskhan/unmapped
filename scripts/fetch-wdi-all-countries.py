"""
Fetch World Bank WDI indicators for ALL economies and save to
data/wdi_all_countries_full.json

Output structure:
{
  "GHA": {
    "SL.UEM.1524.ZS": { "2021": 12.5, "2022": 11.8, ... },
    "IT.NET.USER.ZS":  { "2021": 44.0, ... },
    ...
  },
  "BGD": { ... },
  ...
}

Run: python scripts/fetch-wdi-all-countries.py
"""

import json
from pathlib import Path

import pandas as pd
import wbgapi as wb

INDICATORS = {
    # ── education ──
    "SE.SEC.ENRR":        "secondary_enrollment_gross",
    "SE.PRM.CMPT.ZS":     "primary_completion_rate",
    "SE.ADT.LITR.ZS":     "adult_literacy_rate",
    "SE.ADT.1524.LT.ZS":  "youth_literacy_rate",
    "HD.HCI.OVRL":        "human_capital_index",
    "HD.HCI.LAYS":        "learning_adjusted_school_years",
    "SE.XPD.TOTL.GD.ZS":  "govt_education_spend_pct_gdp",

    # ── employment & labor ──
    "SL.UEM.1524.ZS":     "youth_unemployment_pct",
    "SL.UEM.NEET.ZS":     "neet_rate_pct",
    "SL.EMP.SELF.ZS":     "self_employed_pct",
    "SL.EMP.TOTL.SP.ZS":  "employment_ratio",
    "SL.AGR.EMPL.ZS":     "employment_agriculture_pct",
    "SL.SRV.EMPL.ZS":     "employment_services_pct",
    "SL.IND.EMPL.ZS":     "employment_industry_pct",
    "SL.TLF.CACT.ZS":     "labor_force_participation_rate",
    "SL.TLF.CACT.FE.ZS":  "female_labor_force_participation",
    "SL.EMP.VULN.ZS":     "vulnerable_employment_pct",

    # ── digital infrastructure ──
    "IT.NET.USER.ZS":     "internet_users_pct",
    "IT.CEL.SETS.P2":     "mobile_subscriptions_per_100",

    # ── economy ──
    "NY.GDP.PCAP.CD":     "gdp_per_capita_usd",
    "NY.GDP.PCAP.PP.CD":  "gdp_per_capita_ppp",
    "NY.GNP.PCAP.CD":     "gni_per_capita_usd",
    "SI.POV.DDAY":        "poverty_headcount_190",
    "FP.CPI.TOTL.ZG":     "inflation_consumer_pct",

    # ── demographics ──
    "SP.POP.TOTL":        "population_total",
    "SP.POP.1564.TO.ZS":  "working_age_population_pct",
    "SP.POP.GROW":        "population_growth_rate",
}

# Indicators to try individually if bulk fetch fails (some WDI codes
# are renamed or removed across API versions)
FALLBACK_INDICATORS = {
    "IT.MOB.4G.ZS":      "mobile_broadband_per_100",
    "SL.ISV.IFRM.ZS":    "informal_employment_pct",
}

OUTPUT_PATH = Path("data/wdi_all_countries_full.json")
MRV = 5  # most recent values to fetch per indicator


def fetch_indicators(indicator_dict, label="main"):
    """Fetch a dict of WDI indicators, returning a long-form DataFrame."""
    codes = list(indicator_dict.keys())
    print(f"  [{label}] Fetching {len(codes)} indicators...")
    try:
        df = wb.data.DataFrame(codes, mrv=MRV)
        df = df.reset_index()
        df_long = df.melt(
            id_vars=["economy", "series"],
            var_name="year",
            value_name="value",
        )
        df_long["year"] = df_long["year"].str.replace("YR", "", regex=False)
        df_long = df_long.dropna(subset=["value"])
        print(f"  [{label}] Got {len(df_long)} data points")
        return df_long
    except Exception as e:
        print(f"  [{label}] Bulk fetch failed: {e}")
        return pd.DataFrame()


def fetch():
    total = len(INDICATORS) + len(FALLBACK_INDICATORS)
    print(f"Fetching {total} WDI indicators for all economies (mrv={MRV})...")
    print("This may take 60-120 seconds.\n")

    df_main = fetch_indicators(INDICATORS, "main")

    # Try fallback indicators one-by-one (they may use retired codes)
    fallback_frames = []
    for code, name in FALLBACK_INDICATORS.items():
        try:
            df_fb = fetch_indicators({code: name}, f"fallback:{code}")
            if not df_fb.empty:
                fallback_frames.append(df_fb)
        except Exception as e:
            print(f"  [fallback:{code}] Skipped — {e}")

    df_long = pd.concat([df_main] + fallback_frames, ignore_index=True)

    # Build nested dict: ISO3 -> indicator_code -> year -> value
    result = {}
    skipped = 0
    for _, row in df_long.iterrows():
        iso3 = row["economy"]
        indicator = row["series"]
        year = str(int(row["year"]))
        value = row["value"]

        if not isinstance(iso3, str) or len(iso3) != 3:
            skipped += 1
            continue

        result.setdefault(iso3, {}).setdefault(indicator, {})[year] = round(float(value), 6)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=None)

    indicators_found = set()
    for iso3_data in result.values():
        indicators_found.update(iso3_data.keys())

    country_count = len(result)
    print(f"\nSaved {country_count} economies x {len(indicators_found)} indicators to {OUTPUT_PATH}")
    print(f"Indicators present: {sorted(indicators_found)}")
    if skipped:
        print(f"Skipped {skipped} aggregate/non-country rows")

    wanted = set(INDICATORS.keys()) | set(FALLBACK_INDICATORS.keys())
    missing = wanted - indicators_found
    if missing:
        print(f"\nWARNING — indicators not returned by API: {sorted(missing)}")
    else:
        print("\nAll requested indicators present.")


if __name__ == "__main__":
    fetch()
