from sqlalchemy import text
from connection import engine

def test_database():

    with engine.connect() as connection:

        print("DATABASE:", connection.execute(
            text("SELECT DATABASE()")
        ).scalar())

        tables = connection.execute(
            text("SHOW TABLES")
        ).fetchall()

        print("\nAVAILABLE TABLES:")

        for table in tables:
            print(table[0])

        employees = connection.execute(
            text("SELECT * FROM employees")
        ).fetchall()

        print("\nEMPLOYEE RECORDS:")

        for employee in employees:
            print(employee)


if __name__ == "__main__":
    test_database()