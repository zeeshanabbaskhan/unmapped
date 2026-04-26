import wbgapi as wb
import pandas as pd
import json
from pathlib import Path


def write_json(payload, output_path):
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

# ── All countries you'll ever need ──────────────────────────────
COUNTRIES = ['GHA', 'BGD', 'KEN', 'NGA', 'UGA']  # add any ISO-3 code

# ── Education indicators (all from WDI, sourced from UNESCO UIS) ─
indicators = {
    'SE.SEC.ENRR':     'gross_enrollment_secondary_pct',
    'SE.PRM.CMPT.ZS':  'primary_completion_rate_pct',
    'SE.ADT.LITR.ZS':  'adult_literacy_rate_pct',
    'SE.ADT.1524.LT.ZS': 'youth_literacy_rate_pct',
    'HD.HCI.OVRL':     'human_capital_index',
    'HD.HCI.LAYS':     'learning_adjusted_school_years',
    'SL.UEM.1524.ZS':  'youth_unemployment_pct',
    'SL.UEM.NEET.ZS':  'neet_rate_pct',
    'IT.NET.USER.ZS':  'internet_users_pct',
    'IT.MOB.4G.ZS':    'mobile_broadband_per_100',
    'NY.GDP.PCAP.CD':  'gdp_per_capita_usd',
    'SL.ISV.IFRM.ZS':  'informal_employment_pct',
    'SL.EMP.SELF.ZS':  'self_employed_pct',
}

# ── Fetch all at once ────────────────────────────────────────────
df = wb.data.DataFrame(
    list(indicators.keys()),
    COUNTRIES,
    mrv=5          # 5 most recent years
)

# Convert wide format (YR2021, YR2022...) into long rows:
# country + indicator + year + value
df_long = (
    df.reset_index()
    .melt(
        id_vars=["economy", "series"],
        var_name="year",
        value_name="value",
    )
    .rename(
        columns={
            "economy": "country_code",
            "series": "indicator_code",
        }
    )
)

# Add friendly labels
country_meta = wb.economy.DataFrame(COUNTRIES).reset_index().rename(
    columns={"id": "country_code", "name": "country_name"}
)[["country_code", "country_name"]]

df_long["indicator_name"] = df_long["indicator_code"].map(indicators)
df_long["year"] = df_long["year"].str.replace("YR", "", regex=False).astype(int)

df_long = (
    df_long.merge(country_meta, on="country_code", how="left")
    .loc[:, ["country_code", "country_name", "indicator_code", "indicator_name", "year", "value"]]
    .sort_values(["country_code", "indicator_code", "year"], ignore_index=True)
)

output_csv = Path("data/wdi_all_countries.csv")
output_csv.parent.mkdir(parents=True, exist_ok=True)
df_long.to_csv(output_csv, index=False)

# Use pandas JSON conversion so missing values become proper null (not NaN)
json_records = json.loads(df_long.to_json(orient="records"))
write_json(json_records, "data/wdi_all_countries.json")