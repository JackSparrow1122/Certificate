"""
Generate an XLSX seed file for student import.

This script matches the REQUIRED_HEADERS used by:
- src/components/superadmin/ExcelStudentImport.jsx

Usage:
  python seed_students_excel.py
  python seed_students_excel.py --rows 250 --output students_seed.xlsx --seed 42
"""

from __future__ import annotations

import argparse
import random
import uuid
from datetime import date
from pathlib import Path

from openpyxl import Workbook

REQUIRED_HEADERS = [
    "SN",
    "FULL NAME OF STUDENT",
    "EMAIL ID",
    "MOBILE NO.",
    "BIRTH DATE",
    "GENDER",
    "HOMETOWN",
    "10th PASSING YR",
    "10th OVERALL MARKS %",
    "12th PASSING YR",
    "12th OVERALL MARKS %",
    "DIPLOMA COURSE",
    "DIPLOMA SPECIALIZATION",
    "DIPLOMA PASSING YR",
    "DIPLOMA OVERALL MARKS %",
    "GRADUATION COURSE",
    "GRADUATION SPECIALIZATION",
    "GRADUATION PASSING YR",
    "GRADUATION OVERALL MARKS %",
    "COURSE",
    "SPECIALIZATION",
    "PASSING YEAR",
    "OVERALL MARKS %",
]

FIRST_NAMES = [
    "Aarav", "Priya", "Rohit", "Nikhil", "Riya", "Rahul", "Ananya", "Sakshi",
    "Kunal", "Sneha", "Aditya", "Ishita", "Yash", "Neha", "Soham", "Pooja",
]

LAST_NAMES = [
    "Sharma", "Verma", "Patil", "Pawar", "Kulkarni", "Singh", "Gupta", "Jadhav",
    "Deshmukh", "Joshi", "Mane", "Kale", "More", "Yadav", "Shinde", "Naik",
]

HOMETOWNS = [
    "Pune", "Mumbai", "Nashik", "Nagpur", "Kolhapur", "Aurangabad", "Satara", "Solapur",
    "Ahmednagar", "Jalgaon", "Thane", "Sangli",
]

GENDERS = ["Male", "Female", "Other"]


def random_name() -> str:
    return f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"


def random_birth_date() -> date:
    year = random.randint(2000, 2006)
    month = random.randint(1, 12)
    day = random.randint(1, 28)
    return date(year, month, day)


def to_birth_date_text(d: date) -> str:
    return d.strftime("%d-%b-%y")


def random_phone() -> str:
    return f"9{random.randint(100000000, 999999999)}"


def random_marks(low: float, high: float) -> float:
    return round(random.uniform(low, high), 2)


def generate_unique_email(name: str) -> str:
    email_local = name.lower().replace(" ", ".")
    unique_part = uuid.uuid4().hex[:8]  # guaranteed unique
    return f"{email_local}.{unique_part}@example.com"


def build_row(sn_value: str) -> list:
    name = random_name()
    birth = random_birth_date()
    gender = random.choice(GENDERS)
    hometown = random.choice(HOMETOWNS)

    tenth_year = birth.year + 16
    twelfth_year = tenth_year + 2

    tenth_marks = random_marks(60, 98)
    twelfth_marks = random_marks(55, 97)

    email = generate_unique_email(name)

    graduation_course = random.choice(["B.E.", "B.Tech", "B.Sc", "BCA"])
    graduation_specialization = random.choice(
        ["Computer", "IT", "Electronics", "Mechanical", "Civil"]
    )
    graduation_passing_year = twelfth_year + random.randint(3, 4)
    graduation_marks = random_marks(58, 92)

    diploma_course = ""
    diploma_specialization = ""
    diploma_passing_year = ""
    diploma_marks = ""

    post_grad_course = ""
    post_grad_specialization = ""
    post_grad_passing_year = ""
    post_grad_marks = ""

    return [
        sn_value,
        name,
        email,
        random_phone(),
        to_birth_date_text(birth),
        gender,
        hometown,
        tenth_year,
        tenth_marks,
        twelfth_year,
        twelfth_marks,
        diploma_course,
        diploma_specialization,
        diploma_passing_year,
        diploma_marks,
        graduation_course,
        graduation_specialization,
        graduation_passing_year,
        graduation_marks,
        post_grad_course,
        post_grad_specialization,
        post_grad_passing_year,
        post_grad_marks,
    ]


def write_xlsx(output_path: Path, rows: int, sn_prefix: str, start_number: int) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "students_seed"

    sheet.append(REQUIRED_HEADERS)

    for i in range(rows):
        sn_value = (
            f"{sn_prefix}{start_number + i:04d}"
            if sn_prefix
            else str(start_number + i)
        )
        sheet.append(build_row(sn_value))

    workbook.save(output_path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate student seed XLSX for ERP import")
    parser.add_argument("--rows", type=int, default=100, help="Number of student rows to generate")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("students_seed.xlsx"),
        help="Output .xlsx filename",
    )
    parser.add_argument(
        "--sn-prefix",
        default="STU",
        help="Prefix for SN values (example: STU -> STU0001). Use empty string for numeric IDs.",
    )
    parser.add_argument(
        "--start-number",
        type=int,
        default=1,
        help="Starting sequence number for SN",
    )
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducible output")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if args.rows <= 0:
        raise ValueError("--rows must be greater than 0")

    random.seed(args.seed)

    output_path = args.output.resolve()
    write_xlsx(
        output_path=output_path,
        rows=args.rows,
        sn_prefix=args.sn_prefix,
        start_number=args.start_number,
    )

    print(f"Generated: {output_path}")
    print(f"Rows: {args.rows}")
    print("Headers:")
    for header in REQUIRED_HEADERS:
        print(f"- {header}")


if __name__ == "__main__":
    main()