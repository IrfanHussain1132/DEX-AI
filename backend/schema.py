from sqlalchemy import inspect

try:
    from .connection import engine
except ImportError:
    from connection import engine

def get_database_schema():

    inspector = inspect(engine)

    schema = {}

    tables = inspector.get_table_names()

    for table in tables:

        columns = inspector.get_columns(table)

        primary_keys = inspector.get_pk_constraint(table)

        foreign_keys = inspector.get_foreign_keys(table)

        schema[table] = {
            "columns": [
                {
                    "name": column["name"],
                    "type": str(column["type"]),
                    "nullable": column["nullable"]
                }
                for column in columns
            ],

            "primary_keys": primary_keys.get(
                "constrained_columns", []
            ),

            "foreign_keys": foreign_keys
        }

    return schema


if __name__ == "__main__":

    database_schema = get_database_schema()

    for table, details in database_schema.items():

        print("\nTABLE:", table)

        print("COLUMNS:")

        for column in details["columns"]:
            print(column)

        print("PRIMARY KEYS:", details["primary_keys"])

        print("FOREIGN KEYS:", details["foreign_keys"])
