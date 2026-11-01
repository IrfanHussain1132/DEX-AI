from agents.sql_generator import generate_sql


def main():

    questions = [
        "Find the top 5 highest-paid employees.",

        "Show the average salary of each department.",

        "Find employees who work in Hyderabad.",

        "Which employee generated the highest sales?",

        "Calculate total sales for each month."
    ]

    for question in questions:

        print("\n" + "=" * 60)

        print("QUESTION:")
        print(question)

        sql = generate_sql(question)

        print("\nGENERATED SQL:")
        print(sql)

        print("=" * 60)


if __name__ == "__main__":
    main()