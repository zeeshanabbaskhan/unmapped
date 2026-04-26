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
    "SE.SEC.ENRR":       "secondary_enrollment_gross",
    "SE.PRM.CMPT.ZS":    "primary_completion_rate",
    "SE.ADT.LITR.ZS":    "adult_literacy_rate",
    "SE.ADT.1524.LT.ZS": "youth_literacy_rate",
    "HD.HCI.OVRL":       "human_capital_index",
    "HD.HCI.LAYS":       "learning_adjusted_school_years",
    "SL.UEM.1524.ZS":    "youth_unemployment_pct",
    "SL.UEM.NEET.ZS":    "neet_rate_pct",
    "IT.NET.USER.ZS":    "internet_users_pct",
    "IT.MOB.4G.ZS":      "mobile_broadband_per_100",
    "NY.GDP.PCAP.CD":    "gdp_per_capita_usd",
    "SL.ISV.IFRM.ZS":    "informal_employment_pct",
    "SL.EMP.SELF.ZS":    "self_employed_pct",
    "SL.EMP.TOTL.SP.ZS": "employment_ratio",
}

OUTPUT_PATH = Path("data/wdi_all_countries_full.json")
MRV = 5  # most recent values to fetch per indicator


def fetch():
    print(f"Fetching {len(INDICATORS)} WDI indicators for all economies (mrv={MRV})...")
    print("This may take 30-90 seconds.\n")

    df = wb.data.DataFrame(list(INDICATORS.keys()), mrv=MRV)
    df = df.reset_index()

    # Melt wide (YR2021, YR2022...) to long format
    df_long = df.melt(
        id_vars=["economy", "series"],
        var_name="year",
        value_name="value",
    )
    df_long["year"] = df_long["year"].str.replace("YR", "", regex=False)
    df_long = df_long.dropna(subset=["value"])

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
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))

    country_count = len(result)
    indicator_count = len(INDICATORS)
    print(f"Saved {country_count} economies x {indicator_count} indicators to {OUTPUT_PATH}")
    if skipped:
        print(f"Skipped {skipped} aggregate/non-country rows (World, regions, etc.)")


if __name__ == "__main__":
    fetch()
