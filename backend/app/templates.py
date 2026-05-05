WORLD_CUP_2026_GROUPS = {
    "A": ["Mexico", "South Africa", "Korea Republic", "Czechia"],
    "B": ["Canada", "Bosnia and Herzegovina", "Qatar", "Switzerland"],
    "C": ["Brazil", "Morocco", "Haiti", "Scotland"],
    "D": ["USA", "Paraguay", "Australia", "Türkiye"],
    "E": ["Germany", "Curacao", "Cote d'Ivoire", "Ecuador"],
    "F": ["Netherlands", "Japan", "Sweden", "Tunisia"],
    "G": ["Belgium", "Egypt", "IR Iran", "New Zealand"],
    "H": ["Spain", "Cabo Verde", "Saudi Arabia", "Uruguay"],
    "I": ["France", "Senegal", "Iraq", "Norway"],
    "J": ["Argentina", "Algeria", "Austria", "Jordan"],
    "K": ["Portugal", "Congo DR", "Uzbekistan", "Colombia"],
    "L": ["England", "Croatia", "Ghana", "Panama"],
}

TEAM_COLORS = {
    "ALGERIA": ("#f7f7f2", "#148143"),
    "ARGENTINA": ("#75aadb", "#ffffff"),
    "AUSTRALIA": ("#f8c400", "#115740"),
    "AUSTRIA": ("#ef3340", "#ffffff"),
    "BELGIUM": ("#d00027", "#fdda24"),
    "BOSNIA_AND_HERZEGOVINA": ("#1d4ed8", "#facc15"),
    "BRAZIL": ("#fedd00", "#009c3b"),
    "CABO_VERDE": ("#003893", "#ffffff"),
    "CANADA": ("#e31b23", "#ffffff"),
    "COLOMBIA": ("#fcd116", "#003893"),
    "CONGO_DR": ("#00a3e0", "#f7d618"),
    "CROATIA": ("#ffffff", "#e32219"),
    "CURACAO": ("#0057b8", "#f9d616"),
    "CZECHIA": ("#d7141a", "#ffffff"),
    "COTE_DIVOIRE": ("#f77f00", "#009e60"),
    "ECUADOR": ("#ffdd00", "#034ea2"),
    "EGYPT": ("#ce1126", "#ffffff"),
    "ENGLAND": ("#f7f7f7", "#cf142b"),
    "FRANCE": ("#1d3557", "#ffffff"),
    "GERMANY": ("#f7f7f7", "#111111"),
    "GHANA": ("#ffffff", "#fcd116"),
    "HAITI": ("#00209f", "#d21034"),
    "IR_IRAN": ("#ffffff", "#239f40"),
    "IRAQ": ("#ce1126", "#ffffff"),
    "JAPAN": ("#003f8f", "#ffffff"),
    "JORDAN": ("#d71920", "#ffffff"),
    "KOREA_REPUBLIC": ("#e6002d", "#ffffff"),
    "MEXICO": ("#006847", "#ce1126"),
    "MOROCCO": ("#c1272d", "#006233"),
    "NETHERLANDS": ("#f58220", "#21468b"),
    "NEW_ZEALAND": ("#f7f7f7", "#111111"),
    "NORWAY": ("#ba0c2f", "#00205b"),
    "PANAMA": ("#d21034", "#ffffff"),
    "PARAGUAY": ("#d52b1e", "#ffffff"),
    "PORTUGAL": ("#c8102e", "#006b3f"),
    "QATAR": ("#8a1538", "#ffffff"),
    "SAUDI_ARABIA": ("#006c35", "#ffffff"),
    "SCOTLAND": ("#002b5c", "#ffffff"),
    "SENEGAL": ("#ffffff", "#00853f"),
    "SOUTH_AFRICA": ("#ffb81c", "#007a4d"),
    "SPAIN": ("#c60b1e", "#ffc400"),
    "SWITZERLAND": ("#d52b1e", "#ffffff"),
    "SWEDEN": ("#005293", "#fecb00"),
    "TUNISIA": ("#e70013", "#ffffff"),
    "TÜRKIYE": ("#e30a17", "#ffffff"),
    "USA": ("#ffffff", "#3c3b6e"),
    "URUGUAY": ("#75aadb", "#111111"),
    "UZBEKISTAN": ("#1eb2e8", "#ffffff"),
}
PLAYOFF_COLORS = ("#3f3f46", "#e5e7eb")


def world_cup_items() -> list[dict[str, str | int | None]]:
    items: list[dict[str, str | int | None]] = []
    for group_name, teams in WORLD_CUP_2026_GROUPS.items():
        for index, team in enumerate(teams):
            code = (
                team.upper()
                .replace(" ", "_")
                .replace("/", "_")
                .replace("'", "")
                .replace("-", "_")
            )[:32]
            primary, secondary = TEAM_COLORS.get(code, PLAYOFF_COLORS)
            items.append(
                {
                    "name": team,
                    "code": code,
                    "group_name": group_name,
                    "seed_label": f"Group {group_name}",
                    "primary_color": primary,
                    "secondary_color": secondary,
                    "position": len(items),
                }
            )
    return items


WORLD_CUP_KNOCKOUT_ROUTE = [
    ("Round of 32", 73, "Group A runners-up", "Group B runners-up", "Los Angeles"),
    ("Round of 32", 74, "Group E winners", "Group A/B/C/D/F third place", "Boston"),
    ("Round of 32", 75, "Group F winners", "Group C runners-up", "Monterrey"),
    ("Round of 32", 76, "Group C winners", "Group F runners-up", "Houston"),
    ("Round of 32", 77, "Group I winners", "Group C/D/F/G/H third place", "New York New Jersey"),
    ("Round of 32", 78, "Group E runners-up", "Group I runners-up", "Dallas"),
    ("Round of 32", 79, "Group A winners", "Group C/E/F/H/I third place", "Mexico City"),
    ("Round of 32", 80, "Group L winners", "Group E/H/I/J/K third place", "Atlanta"),
    ("Round of 32", 81, "Group D winners", "Group B/E/F/I/J third place", "San Francisco Bay Area"),
    ("Round of 32", 82, "Group G winners", "Group A/E/H/I/J third place", "Seattle"),
    ("Round of 32", 83, "Group K runners-up", "Group L runners-up", "Toronto"),
    ("Round of 32", 84, "Group H winners", "Group J runners-up", "Los Angeles"),
    ("Round of 32", 85, "Group B winners", "Group E/F/G/I/J third place", "Vancouver"),
    ("Round of 32", 86, "Group J winners", "Group H runners-up", "Miami"),
    ("Round of 32", 87, "Group K winners", "Group D/E/I/J/L third place", "Kansas City"),
    ("Round of 32", 88, "Group D runners-up", "Group G runners-up", "Dallas"),
    ("Round of 16", 89, "Winner match 74", "Winner match 77", "Philadelphia"),
    ("Round of 16", 90, "Winner match 73", "Winner match 75", "Houston"),
    ("Round of 16", 91, "Winner match 76", "Winner match 78", "New York New Jersey"),
    ("Round of 16", 92, "Winner match 79", "Winner match 80", "Mexico City"),
    ("Round of 16", 93, "Winner match 83", "Winner match 84", "Dallas"),
    ("Round of 16", 94, "Winner match 81", "Winner match 82", "Seattle"),
    ("Round of 16", 95, "Winner match 86", "Winner match 88", "Atlanta"),
    ("Round of 16", 96, "Winner match 85", "Winner match 87", "Vancouver"),
    ("Quarter-finals", 97, "Winner match 89", "Winner match 90", "Boston"),
    ("Quarter-finals", 98, "Winner match 93", "Winner match 94", "Los Angeles"),
    ("Quarter-finals", 99, "Winner match 91", "Winner match 92", "Miami"),
    ("Quarter-finals", 100, "Winner match 95", "Winner match 96", "Kansas City"),
    ("Semi-finals", 101, "Winner match 97", "Winner match 98", "Dallas"),
    ("Semi-finals", 102, "Winner match 99", "Winner match 100", "Atlanta"),
    ("Third place", 103, "Loser match 101", "Loser match 102", "Miami"),
    ("Final", 104, "Winner match 101", "Winner match 102", "New York New Jersey"),
]


def world_cup_knockout_matches() -> list[dict[str, str | int | None]]:
    return [
        {
            "round_name": round_name,
            "match_no": match_no,
            "home_placeholder": home,
            "away_placeholder": away,
            "venue": venue,
            "position": index,
        }
        for index, (round_name, match_no, home, away, venue) in enumerate(WORLD_CUP_KNOCKOUT_ROUTE)
    ]
